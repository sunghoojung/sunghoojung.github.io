---
title: Training a system one model to solve captchas
date: 2026-11-19
draft: true
thumbnail: pasted-20261119182822.png
tags:
  - machine-learning
  - vision-language-models
  - fine-tuning
  - lora
  - experiment-log
---

## Contents

1. [Why captchas](#why-captchas)
2. [Setup](#setup)
3. [What plateaued](#what-plateaued)
4. [What moved the needle](#what-moved-the-needle)
5. [The Jev idea](#the-jev-idea)
6. [TEV versions, and how the first one failed](#tev-versions-and-how-the-first-one-failed)
7. [Findings](#findings)
8. [Lessons](#lessons)
9. [What is next](#what-is-next)
10. [Mistakes worth admitting](#mistakes-worth-admitting)
11. [References](#references)

## Why captchas

I came to captchas through sneaker Twitter and botting, where they are what stands between you and a fast checkout on a popular release. Back in 2019, the usual way to solve them was a convolutional neural network (CNN) trained on a big pile of labeled images. That worked until the puzzles changed. Every new format meant a new dataset and a retrain, because the CNNs didn't generalize to puzzles they hadn't seen. For my deep learning final project I came back to the same problem with better tools: can a vision-language model learn these puzzles from a small amount of data and carry over to new ones?

I picked hCaptcha because it keeps rolling out new kinds of puzzles that take a bit of reasoning. Captchas also look at things like mouse movement, IP address and browser details, but this project is only about the puzzle itself: look at the image, read the instruction, give the right answer. Each puzzle is a small image with a one-line instruction, and they come in four kinds:

- **Picture grids.** A 3×3 grid of photos: "Pick all objects that melt at room temperature."
- **Canvas clicks.** A 500×550 scene with many small objects: "Find drinks that can be hot or cold."
- **Drags.** Move a piece to where it fits: "Drag the letter to the place where it fits."
- **Boxes.** "Please draw a box around the object that is different."

If you've done an hCaptcha recently, you've probably noticed the puzzle types keep changing. That is the whole problem. My goal was a model that learns them from a few examples and copes with the new ones.

![Example of a drag challenge](pasted-20261119182822.png)

## Setup

**Terms.** A page is one screen of a challenge, and each action on it is a step. A family is a question type, such as "drinks that can be hot or cold". Held-out pages are never trained on. A new-family page is from a type with no training examples at all; a seen-family page is a new puzzle of a type the model did train on.

**Model.** Qwen3-VL-4B-Instruct, a 4-billion-parameter vision-language model, run in bf16 (16-bit) precision and fine-tuned with LoRA adapters: small trainable add-on weights, so the base model itself stays frozen. I chose it because it fits on a single 16 GB GPU, and because a small model makes experiments cheap. I can find out what works here before paying for a bigger one.

**Data.** I built a recorder that logs every click, drag and box a person makes, lined up frame by frame with what was on screen. Each solved challenge is one episode. I started with about a thousand and ended with 1,368.

**Output.** For most of the project the model wrote three short lines and then its action. I call this the written plan:

```
Selected: [...]     what is already done
Remaining: [...]    every action still to take, in panel pixels
Target: {...}       the next action
```

The training targets for these lines come straight from the person's recorded actions, so they are right by construction. The first reinforcement learning runs used free-form reasoning instead, and by the end the model writes nothing at all (see [The Jev idea](#the-jev-idea)).

**Metrics.**

- _Step accuracy_ (the reinforcement learning section only): whether one next action is a valid move, given what has already been done on the page.
- _First-step plan right_ (everything after): on a page's first step, the Remaining list must match the person's actions exactly, in any order. A click counts within 30 px. A grid click counts on the right tile. A drag counts when the grab is within 30 px and the piece lands within 20 px of where the person's landed. A box counts when it overlaps the person's box by at least half (IoU ≥ 0.5).

![One recorded episode: “Find drinks that can be hot or cold.” The person clicked the coffee cup, the mug and the glass, then submitted.](episode-example.png)

The recorder saved each click with the screenshot it was made on: (130, 220), (220, 217) and (393, 375) in panel pixels, then a submit. That one page becomes four training examples, one per step. In the model's text, coordinates are on a 0–1000 grid over the panel, so (130, 220) becomes [260, 400]. In each example the model sees that step's screenshot, the question and the actions so far, and learns to write:

```text
[step 1]
Selected: []
Remaining: [{"op":"click","at":[260,400]},{"op":"click","at":[440,395]},{"op":"click","at":[786,682]}]
Target: {"op":"click","at":[260,400]}
<answer>{"op":"click","at":[260,400]}</answer>

[step 2]
Selected: [{"op":"click","at":[260,400]}]
Remaining: [{"op":"click","at":[476,398]},{"op":"click","at":[822,669]}]
Target: {"op":"click","at":[476,398]}

[step 3]
Selected: [{"op":"click","at":[260,400]},{"op":"click","at":[440,395]}]
Remaining: [{"op":"click","at":[822,669]}]
Target: {"op":"click","at":[822,669]}

[step 4]
Selected: [{"op":"click","at":[260,400]},{"op":"click","at":[440,395]},{"op":"click","at":[786,682]}]
Remaining: []
Target: {"op":"submit"}
```

The `<answer>` line repeats Target, so I've left it off steps 2 to 4. Step 1 is the one the score counts, because its Remaining list is the whole plan for the page. From step 2 on, the points still to do are written a few pixels off the person's clicks (up to 25 px). That way the model has to recognize what is already done by looking at the page, not by copying numbers from the history.

**Noise.** Before comparing two runs, it helps to know how much the score moves on its own:

- Re-running the same weights with greedy decoding changed 98 of 225 answers by a coordinate digit, because vLLM's bf16 arithmetic shifts slightly with batching. That alone is about ±2 points.
- A paired bootstrap over challenges put run-to-run differences at about ±6–8 points on the 151- and 207-page test sets.
- Neighboring epochs of one run moved by up to 9 pages, even in stable runs.

So a gain of a few points is not a gain.

## What plateaued

### GRPO first

I started with reinforcement learning because of DeepSeek-R1-Zero, which applied GRPO (Group Relative Policy Optimization) straight to a base model and watched reasoning emerge on its own: AIME 2024 went from 15.6% to 71%. I underestimated the cost and the chaos. On one 16 GB GPU a single schedule took about 96 hours, and runs broke in strange ways. Reasoning decayed into word salad, answers looped one sentence, weights turned into NaN, and Chinese words crept into English answers, the same "language mixing" the R1 paper reports.

The deeper problem was the starting point. GRPO has the model try the same question several times and pushes it toward the tries that scored better, so it can only reinforce what the model already does some of the time. R1-Zero started from a huge model that already knew math. Mine knew almost nothing about these puzzles: on drags, all 16 tries failed together in every early group, leaving nothing to learn from. In run 5, 40 minutes of plain supervised training on 474 steps took step accuracy from 0.31 to 0.71. GRPO then added only 0.04 before drifting, and a later supervised-only run matched it with no reinforcement learning at all. Starting GRPO from my best supervised model hit the same wall from the other side. Its whole-plan score was 0.849 before and after 48 updates, because now the model got most pages right in all 16 tries, so again there was nothing to compare.

Looking back, this is the order the field uses. Even DeepSeek's released R1 was fine-tuned on curated examples before reinforcement learning, partly to fix R1-Zero's language mixing. Reinforcement learning pays off once a model succeeds often enough to learn from, but not reliably. Before that, more demonstrations do more than any reward.

![Run 5 and the GRPO learning signal](fig-grpo.png "Figure 1. (a) Run 5 on held-out new question families: 40 minutes of supervised training takes the untrained model from 0.31 to 0.71; GRPO peaks at 0.745, level with a supervised-only run, then drifts until its guard stops it. (b) Share of GRPO groups whose 16 tries got different rewards, the only groups GRPO can learn from. It shrinks as the model improves, and starting from the best supervised model it stays at 11–39%.")

### Five reasoning formats, one ceiling

With reinforcement learning set aside, I went back to supervised training and asked a simpler question: does it matter what the model writes before its plan? From here on, every number is the stricter score, the whole plan right on a page's first step. I tried five formats:

| Format | What the first step writes | Best score, new / seen families |
| --- | --- | --- |
| v5 | a scene sentence, then the plan | 0.44 / 0.69 |
| v6b | an object list and a rule, plus two other changes | 0.40 / 0.68 |
| v7 | `[x,y] name -> yes/no` for every object | 0.36 / 0.68 |
| v8 | all objects, then a rule sentence, then verdicts | 0.43 / 0.69 |
| v9 | v8 with one `[x,y] -> verdict` line per object | 0.43 / 0.62 |

![Five reasoning formats on the old split, peaking at 65 to 67 of 151 new-family pages](fig1-format-plateau.png "Figure 2. Five written-reasoning formats on the old split, whole first-step plan right per epoch. (a) New question families, 151 pages. (b) Seen families, 207 pages. The best formats peak at 65 to 67 of 151 new-family pages, a tie within noise.")

The formats changed which pages were right, not how many. The misses explain why. Of v8's 86 misses on new families, 51 were letter drags and hexagon shapes, two families with zero training pages. No way of writing can teach a puzzle the model has never seen. That told me I needed more data for those families, not a better format.

A token count showed why more writing didn't help either. One v8 epoch had 304,523 supervised tokens. 42% described the scene, 46% were bookkeeping copied from earlier lines (which reached near-zero loss after one epoch), and only 12% were the decision itself. Most of the training signal went into memorizing object names and positions, not into choosing.

That left one question: was the model failing to _see_ these puzzles, or seeing them and not using what it saw?

### The eyes see more than the words use

I spent a day on that question. "The eyes" here means the vision tower, the part of the model that turns the image into features before the language model reads them. I found four things, plus one caveat.

**Asked directly, it could see.** I took the best checkpoint from the format runs and asked it plain questions outside its trained format, such as "Point to the loose letter." On new-family letter-drag pages it found the letter 37 times out of 39. Inside its trained reasoning, on the same pages, it found it only 22 times. In the 17 misses it often described a scene that wasn't there ("a purple Y on the left") and then acted on what it had made up. The image features were right; the text drifted away from them. The other half of a drag, where the letter goes, stayed bad however I asked: 5 or 6 of 39. That spot is a faint outline, which is a harder seeing problem.

**Its own vision tower beat 21 other encoders.** To measure how much an image encoder knows before any training, I took patch features from 22 encoders at three depths and scored them with fixed rules, no training at all. For example: the drop spot is the patch most similar to the piece, the odd object is the one least similar to the rest, and the matching group is the one most similar to the group already clicked.

![Mean hit rate of 22 vision encoders on seven untrained matching rules](fig-encoders.png "Figure 3. Patch features from 22 vision encoders, scored with seven fixed matching rules and no training (best of raw and blurred per rule, best depth per encoder). Qwen’s own tower at three-quarter depth leads at 0.51. Its last layer, the one nearest the language model, falls to 0.26.")

Qwen's tower at three-quarter depth averaged 0.51, ahead of DINOv2-giant at 0.44. Depth mattered more than which encoder: nearly every encoder did best about three-quarters of the way through, and Qwen's own last layer scored only 0.26. On "the tile that breaks the pattern", the score fell from 0.62 at three-quarter depth to 0.04 at the last layer. A plain cosine-similarity rule with no training found the odd object 93% of the time, on pages where the full model, asked in words, often got it wrong.

**Blur helped one family.** Letter-drag panels are covered in stripes that hide the faint outline of the letter's slot. A 5 px Gaussian blur wipes the stripes out.

![A letter-drag page as served and after a 5 px Gaussian blur](fig-blur.png "Figure 4. A letter-drag page. (a) As served: the piece (blue) belongs on the faint D under the stripes (red, dashed). (b) After a 5 px Gaussian blur, the stripes are gone.")

With blur, the tower's last layer went from 0.00 to 0.44 on the faint letters, and the full model's "where it fits" went from 5 to 9 of 39. It hurt elsewhere, though. Blur also wipes out the edges of holes, and hole puzzles fell from 14 to 8 of 22.

**More pixels and a bigger model didn't help.** With four times the image tokens, "where it fits" was 3 of 39, and an untrained 8B model got 4. Overall scores at 1×, 2× and 4× tokens were nearly identical.

**The caveat.** The review in the next section pointed out that Qwen3-VL already feeds three intermediate vision layers into the language model, not just the last one. So "the last layer loses it" is too simple. What survives is narrower: the information is in the vision features, and the language side doesn't make full use of it.

## What moved the needle

**Fixing the scoreboard first.** After the formats plateaued, I had a separate agent review my method. It got read-only access and none of my conclusions. It found two problems. A third of the "new family" test pages came from two families with no training pages at all, so no change could ever help them. And I wasn't scoring any training pages, so memorizing and not learning looked the same.

So I re-split the data by challenge, 75/25 within every family. Test pages became **new puzzles from families the model had trained on**, which means the new numbers compare with the old seen-family score (about 0.69), not the new-family 0.43. I also scored a fixed sample of 100 training pages every epoch, and switched to **plan-only** output: just the three lines and the action, no written reasoning. Plan-only scored the same as the written formats, so the reasoning text wasn't adding anything.

After that, three changes moved the held-out score, in this order.

![The same 310 held-out pages with old and new data, and all 397 held-out pages for g1, g2 and g3](fig-needle.png "Figure 5. (a) The same 310 held-out pages and the same plan-only recipe, trained on the old data and on more data. (b) All 397 held-out pages for g1 (more data), g2 (adds a decision-weighted loss, vision LoRA, a cosine schedule and shift/scale augmentation) and g3 (g2 plus a pointing head).")

**More data.** By now I had 1,082 training pages and 397 held-out pages. Every challenge held out before stayed held out, so old and new runs can be compared on the same pages. The first run, g1, used the same recipe on the bigger data. On the 310 test pages both runs shared, it got 18 to 21 more pages right than the old data at every epoch from 2 to 5, and the best scores were 223 against 211. Families that had no training pages before now had some, and they started to work: hexagon puzzles went from 5 of 48 to 35, with 56 training pages instead of none. But g1 was unstable. Its hexagon score went 5, 19, 31, 35, 25, 20, 38, 13 across epochs, and the overall score swung from 0.72 to 0.60 and back. A constant learning rate was too jumpy for this data.

**A better loss, trained eyes, a schedule.** g2 changed four things at once:

1. **The loss.** The decision (the Remaining list) counted four times as much as the bookkeeping copied from earlier lines. Coordinates got soft targets, so a guess 1 pixel off cost less than one 100 pixels off.
2. **The vision tower was trained too,** with its own LoRA at a learning rate of 1e-4.
3. **A cosine schedule.** The learning rate eased down to zero instead of staying constant.
4. **Shift and scale augmentation.** Half the training images were resized and moved, with their coordinates adjusted to match, so the model couldn't memorize where things sit.

g2 climbed steadily to 0.844 (335 of 397), the best written-plan score up to then, and letter drags went from 12 to 17 of 29. Because all four changes landed together, I can't say which one did it.

**A pointing head.** g3 added one small piece during training: a pointing head that reads the image tokens halfway up the language model (layer 18) and learns to point at the patches the person clicked. In g3 it gives no answers. It only gives the vision side a direct signal about where things are. (In TEV, below, the same head becomes how the model answers "where".) g3 reached 0.839 by epoch 4, where g2 needed until epoch 7 for 0.844: a tie, three epochs sooner. On held-out pages the head pointed at the right patch 97–98% of the time. g2 and g3 each got about 30 pages the other missed, 364 of 397 (92%) between them. The model often knew the answer and just didn't always say it.

One number never improved. On the 18 pages from the two families held out entirely, every run got between 2 and 10 right. So the model can handle some puzzles of a kind it has never seen, but none of these changes made it better at that. Every gain above came on families it had trained on.

## The Jev idea

### Watching it think

The first time I let the model play a real widget, I mostly sat there waiting. It got the screenshot, and then for five, ten, sometimes thirty seconds nothing happened while it typed out its plan one token at a time: the Selected line, the Remaining line, every coordinate digit by digit. Over the live challenges I timed, the written plan took a median of 12.4 seconds of model time per challenge, and the slowest took more than a minute. A person clears the same page in two or three seconds.

What bugged me was where that time went. Looking at the picture was quick. By the time the model started writing, it had already seen the page and, in a sense, already made up its mind. Nearly all of the wait was the model spelling that decision out as text.

I was complaining about this to a friend, and they told me to look at system one decision models like Jev. The name comes from Kahneman's two kinds of thinking. System two is slow and deliberate. System one is the quick gut answer you give without talking yourself through it. My written plan was pure system two: it narrated every page before it touched it. A captcha wants system one. Look once, answer.

### What Jev is

**Jev** is TypeSafe's hosted decision model. You send it a piece of text and a few short questions (yes/no, pick one, a score). It reads the text once and answers every question straight from its hidden states, with calibrated probabilities and no generated text. **Kev** is Jared Palmer's open re-implementation ([github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev)), built from an outside reconstruction of Jev: a Qwen backbone, a LoRA adapter and a small pointer head.

Three of its ideas carry straight over to puzzles:

1. **Read once.** The shared input is processed one time and cached.
2. **Questions cannot see each other.** Each question is a short branch that sees the shared input and its own tokens only, so adding a question does not change the others.
3. **Answers are probabilities, not text.** The model can only pick from the options you give it.

I built my own version for puzzle pages and called it TEV. The shared input is the panel's image tokens, the instruction and the actions so far. Everything the model has to decide then becomes a short question that branches off that one cached reading.

![How TEV answers a page: one pass reads it, short questions branch off the cache](fig-tev-diagram.png "Figure 6. How TEV answers a page. One pass reads the screenshot and caches it. Each short question branches off that cache: the words (which action, how many, yes or no) come from next-word probabilities, and the places come from the pointer head. A small planner turns the readouts into mouse actions, and no text is generated. This is the version I ran live at the end; the Action question and the box corners came after the first versions below.")

I made two choices that differ from Kev. The yes/no answer is read from the language model's _own_ `" yes"` and `" no"` token probabilities, renormalized over the two, rather than from a new head. And the written plan is still trained in the same run, so I can compare every readout against it on the same pages.

### Pointing with a query and a key

Reading out words turned out to be the easy part, because a language model already has a probability for every possible next word. "Action:" just asks which of click, drag and box it thinks comes next. "How many:" asks the same thing over the digits 0 to 9. Places are harder. Writing "x=412, y=230" out as text was exactly the slow part I was trying to get rid of.

The trick is to point the way attention already does. Inside a transformer, every token makes a query vector and a key vector, and the dot product of one token's query with another token's key decides how much the first looks at the second. A dot product is biggest when two vectors point the same way, so whichever key is closest to the query wins.

The pointing head from g3 is one more head of exactly that shape. Its query `q` is the hidden state of the question's last token, say the token for "Top-left:", at layer 18. Its keys `k_i` are the hidden states of the 440 image patches at the same layer, each covering about 25 px of the panel. Both are normalized and squeezed down to 256 numbers by a small learned matrix, and every patch gets a score:

```text
score_i = (W_q · q) · (W_k · k_i) / √256
```

A softmax over the 440 scores turns them into a heat map over the page. A normal attention head would use those weights to blend information from the patches. Here the weights are the answer: they show where the model is looking when you ask it for "Top-left". The hottest patch is the point.

Training it was almost boring. For every human demonstration the target is a small soft blob, about one patch wide, centered on the point the person actually used, and the loss is the cross-entropy between that blob and the heat map. The head starts out nearly flat (its query weights begin 100 times smaller than its keys), so bolting it on changes nothing until it has learned something.

![A live box drawn from two pointer questions](fig-pointer.png "Figure 7. A box drawn live from two pointer questions, on “Please draw a box around the animal that hatches from an egg.” (a) “Top-left:” puts 0.13 of all its weight on a single patch, and (b) “Bottom-right:” puts 0.16 on one. Spread evenly, each patch would get 0.002. (c) The box between the two peaks, around the lizard. The widget passed it.")

### Checking spot by spot

A click question can have one right answer or five, so a single pointer is not enough. TEV makes a short list of candidate spots and asks about each one, "Check [x,y] ->", read as the probability of " yes" against " no". A picture grid has nine fixed tile centers. A canvas uses the pointer head's 16 best peaks, spaced apart and refined to the center of their local heat.

The training labels come from the person's actions. A candidate near a click is a yes, the number of clicks is the count, and the grab and drop points answer the drag questions. No new labeling.

A branch is a few tokens plus the verdict whose probability is read (from the trainer):

```python
CHECK_VERDICTS = (" no", " yes")


def check_sequence(tokenizer, point, verdict):
    """One branch's tokens: "Check [x,y] ->" and the verdict token whose probability the branch reads."""
    return tokenizer(f"Check [{point[0]},{point[1]}] ->", add_special_tokens=False)["input_ids"] + [verdict]


def _check_logprobs(policy, prefix, sequences, indices, verdicts, train):
    """(n, 2) log-probabilities of [no, yes] as each listed branch's last token, renormalised over the two."""
    torch = policy.torch
    longest = max(len(sequences[index]) for index in indices)
    positions = torch.zeros((len(indices), longest), dtype=torch.bool, device=policy.device)
    for row, index in enumerate(indices):
        positions[row, len(sequences[index]) - 1] = True
    with policy.autocast():
        _, _, two = policy.forward(prefix, sequences, indices, train=train,
                                   digits={"ids": verdicts, "positions": positions})
    return torch.log_softmax(two.float(), dim=-1)
```

`prefix` holds the prompt's cached keys and values. Each branch is its own row in the batch, so branches cannot attend to each other. The `digits` argument reuses the soft-digit readout path with two token ids instead of ten. The loss is a two-way cross-entropy against the label.

Here is what that looks like on one live page. Eight of the sixteen candidates landed on the globe and came back yes at about 1.0. The other eight came back at 0.01 or less. Eight yeses on one object is a problem I walked straight into with the first version (next section), and it is why TEV merges nearby yeses and asks "How many:". Here the count said 1, so it played one click.

![One live click decision: 16 candidate spots, 8 yes, all on the globe](fig-readout.png "Figure 8. One live click decision, “Identify the item that spins in a circle.” (a) The 16 candidate spots. The 8 that said yes all sit on the globe, and one click was played. (b) p(yes) for each spot, sorted. Action said click with p = 1.00 and How many said 1. No text was generated.")

### Was it actually faster?

Skipping ahead to the live runs at the end of the project: yes, by a lot.

![Model time per live challenge: written plan against TEV](fig-speed.png "Figure 9. Model time per live challenge, log scale. The written plan took a median of 12.4 s over 15 challenges; TEV took 1.2 s over 337.")

The median challenge went from 12.4 seconds of model time to 1.2, about ten times faster. Per decision it went from 5.0 seconds to 0.72. I only timed 15 live challenges on the written plan, so treat that number as rough, but the two clouds don't even overlap: the written plan's fastest challenge took longer than TEV's slowest.

Speed is why I started down this road, but it isn't the whole story. Whether reading answers out is as accurate as writing them is a separate question, and the next two sections are me finding out the hard way.

## TEV versions, and how the first one failed

Every version below is trained together with the written plan, so each readout is compared with the plan on the same held-out pages.

### g4: grids worked, canvas collapsed

g4 is g3 plus the yes/no checks. After epoch 1, on the 242 held-out first steps whose answer is clicks:

- **Grids:** checks 55 of 62, written plan 50.
- **Canvas:** checks 95 of 180, written plan 146.

After epoch 2, grids were 59 of 62 for both. Canvas _fell_ to 52 of 180, while the written plan rose to 154. On 114 of the 180 canvas pages the checks chose too many targets. On training pages the checks were about 99% right, so something wasn't carrying over.

### A wrong diagnosis

The first explanation was neat. In g4, a canvas training page got three kinds of candidates: the person's points with a little jitter (yes), raw head peaks (no) and random points (no). Each kind has its own coordinate pattern. So maybe the branches had learned to tell a candidate's _source_ from its numbers, which is useless on held-out pages where every candidate is a refined peak. I built the fix: make training candidates exactly the way held-out ones are made.

Then I looked at where the wrong yeses actually were.

![Distance from wrongly passed candidates to the nearest target, and canvas pages right by epoch](fig4-rim-failure.png "Figure 10. (a) g4 at epoch 2: of 988 wrongly passed canvas candidates, 898 sat within 60 px of a real target, mostly 30–60 px away. Only 50 were more than 90 px away. (b) Canvas pages right. g4 used candidates 40 px apart and merged passing points within 45 px. g4b used 60 px spacing, left the rim band out of training and merged within 75 px.")

A source shortcut would produce yeses anywhere. These weren't anywhere. Almost all were 30–60 px from a target, on the edge of the _same_ object. With candidates 40 px apart and passing points merged only within 45 px, one object gave two or three yeses, and each became a separate click. The model wasn't wrong that the object was a target. The readout counted it twice.

Re-scoring g4's saved epoch-2 answers with only a 75 px merge lifts canvas from 52 to about 97 of 180, with no retraining.

### g4b: one candidate per object

g4b keeps the peak-made training candidates and adds the fix the data called for. In the settings below, `nms_px` is the spacing between candidates, `exclude_px` is how far a candidate must be from every target to count as a no, and `merge_px` is the radius within which passing points count as one object:

```text
g4   "checks": {"candidates": 16, "nms_px": 40, "exclude_px": 45, "jitter_px": 10}
g4b  "checks": {"candidates": 16, "nms_px": 60, "exclude_px": 75, "jitter_px": 0,
                "proposal": "peaks", "merge_px": 75}
```

A candidate within the 30 px click radius is a yes, one more than 75 px from every target is a no, and the band in between is left out of training (excerpt from `proposed_candidates`):

```python
for _, index in pick_peaks(scores, rows, columns, coordinate, spec["candidates"], spec["nms_px"]):
    point = refine_peak(probs, index, rows, columns)
    distance = nearest(point)
    if distance <= CLICK_RADIUS or distance > spec["exclude_px"]:
        points.append(point)
        labels.append(int(distance <= CLICK_RADIUS))
```

At decision time, passing points within the merge radius count as one object (excerpt from `check_decision`, grading lines removed):

```python
order = sorted(range(len(points)), key=lambda index: (-p_yes[index], index))
kept = []
for index in order:
    if all(_grid_px(points[index], points[other], coordinate) > merge_px for other in kept):
        kept.append(index)
chosen = [index for index in kept if p_yes[index] >= threshold]
```

The model still says yes to rims. At epoch 7, 676 of g4b's 765 wrong yeses are within 60 px of a target. But the merge turns them into one click, and canvas pages with too many clicks fell from 114 (g4, epoch 2) to 5 (g4b, epoch 7).

g4b's written plan, trained alongside, reached 0.846 (336 of 397) at epoch 7. That is one page above g2, which is a tie.

### g4c: a count question

On g4b's canvas pages, a common miss was the wrong number of targets. g4c adds one more branch, `How many:`, answered by one digit and trained against the number of clicks. At decision time it clicks the N likeliest merged candidates.

After epoch 4 of 8, the count is right on 176 of 180 canvas pages (98%) but only 56 of 62 grids (90%). It helps canvas a little (148 of 180, against 144 with the plain 0.5 threshold) and hurts grids (56 against 60). Its written plan is at 0.839 (333 of 397), level with the others.

## Findings

### Grids: the checks win

![Checks against the written plan on grids and canvas, and how often the checks pass the plan's points](fig5-checks-vs-written.png "Figure 11. (a, b) Checks against the written plan on the same held-out first steps. Grids: the checks match or beat the plan at every epoch, and g4c reaches 60 of 62. Canvas: the checks peak at 151 of 180 (g4b, epoch 4) while the plan holds 155–158 from epoch 4. (c) On g4b’s epoch-7 checkpoint, the checks pass 398 of 399 of the plan’s correct canvas points and 14 of its 19 wrong ones.")

On picture grids the checks are level with or above the written plan at every epoch: 58 of 62 from epoch 4 on, and 60 of 62 in g4c. A grid is the ideal case, with nine fixed candidates, no pointing, and one yes/no each.

### Canvas: limited by perception, not readout

On canvas the checks never caught the written plan: 151 against 157 at g4b's epoch 4, and 149 against 158 at epoch 7. I tried every combination I could think of offline, and on canvas alone none beat the written plan. Over all 242 click and grid pages, the best one ("written plan minus the points the checks reject") gained two or three pages, most of them on grids.

The direct test settled it. On g4b's epoch-7 checkpoint I used the written plan's own points as the candidates. The checks passed 398 of its 399 correct points and 14 of its 19 wrong ones. Scored as pages, checks over the written points gave 156, checks over written points plus peaks 156, peaks alone 149, and the written plan 158.

So the yes/no readout and the written plan come from the same beliefs. When the plan is wrong, the checks usually agree with it. What remains on canvas is about what the model sees, not how the answer is read out. The rest of the gap is candidates: from epoch 4 on, 5–13 canvas pages per epoch had a target that no candidate landed on.

### Drags: early numbers

![Grab and landing error distributions for drag where-questions](fig6-drag-errors.png "Figure 12. Drag “where” questions on 110 held-out single-drag pages (g4f, epochs 1 and 2). (a) Grab error: 87 of 110 within the 30 px grab radius at epoch 1, 76 at epoch 2. (b) Landing error: 44 of 110 within 20 px at both epochs.")

A drop spot, like a faint hole, is hard to list as candidates in advance. So for drags g4f asks two pointer questions, `Piece:` and `Drop:`. Each is a short branch whose last token becomes the pointer head's query over every image patch (from the trainer, trimmed):

```python
WHERE_QUESTIONS = ("Piece:", "Drop:")


def _where_scores(policy, prefix, encoded, train):
    tokenizer = policy.processor.tokenizer
    sequences = [tokenizer(question, add_special_tokens=False)["input_ids"] for question in WHERE_QUESTIONS]
    states = policy.branch_states(prefix, sequences, policy.pointer_spec["layer"], train=train)
    positions, rows, columns = coordinate_image_tokens(encoded["ids"], _encoded_grid(encoded),
                                                       policy.pointer_image_token, policy.pointer_merge)
    keys = prefix["captured"][0].index_select(0, policy.torch.tensor(positions, device=prefix["captured"].device))
    return [pointer_scores(policy.pointer_head, states[row, len(sequence) - 1], keys)
            for row, sequence in enumerate(sequences)], rows, columns
```

Numbers from its first two epochs:

|  | Epoch 1 | Epoch 2 |
| --- | --- | --- |
| Where questions right | 43 / 110 | 39 / 110 |
| Written plan right, same pages | 45 / 110 | 54 / 110 |
| Either right | 64 / 110 | 61 / 110 |
| Grab within 30 px | 87 / 110 (79%) | 76 / 110 (69%) |
| Landing within 20 px | 44 / 110 (40%) | 44 / 110 (40%) |
| Median grab / landing error | 16 / 29 px | 22 / 24 px |

The model usually finds the right piece. Landing it is the bottleneck: the 20 px tolerance is smaller than one image patch, which covers about 25 px of the panel. The two readouts fail on different pages, so there is room in combining them.

One worry: on these drag pages, g4f's own written plan (45, then 54) trailed g4b's at the same epochs (67, then 68). The where loss might be interfering with written drags, or it might be early-epoch noise like g4b's slow start. Two epochs aren't enough to tell.

g4e adds a blurred copy of the panel as a second image, aimed at the faint letters. I only have its first epoch (0.662 written, 59 of 62 grid checks), which is too early to say anything.

## Lessons

1. **Fix the scoreboard before tuning anything.** For days the main number couldn't move: noise larger than any effect, a third of the test pages unlearnable, and no score on training pages. After the re-split and page-by-page comparisons, every later decision was readable.
2. **Format changes move which pages are right, not how many.** Five formats, one ceiling. Plan-only matched them all.
3. **Data was the first real lever; loss placement was the second.** Same recipe, more pages: 18 to 21 more pages right on identical test pages. Then weighting the 12% of tokens that are the decision came with the jump to 0.844.
4. **The eyes saw more than the words used, but better eyes alone didn't fix the plan.** The pointing loss made localization 97% right and left the plan level.
5. **A readout needs a notion of "one object".** The first TEV version's yeses were mostly right about the object and wrong about the count, because one object offered three candidates.
6. **Check a diagnosis against the data before building the fix.** The coordinate-shortcut story was plausible and had code behind it. One histogram ruled it out.
7. **A cleaner readout doesn't add knowledge.** The checks inherit the written plan's beliefs, 398 of 399 and 14 of 19. They fix readout errors, not perception errors.
8. **What helps one page type can hurt another.** The count question helps canvas and hurts grids. Per-type recipes beat one global rule.
9. **Bundled changes give results, not explanations.** g2 worked, and I still can't say why.
10. **A tie is a tie.** 336, 335 and 333 of 397 are the same model quality.

## What is next

- **Use each readout where it wins.** Checks for grids, the written plan for canvas and boxes, and both for drags, since they fail on different pages (61–64 of 110 right with either).
- **Land drags more precisely.** Refine around the drop peak at a finer scale than one patch.
- **A pick-one question.** One softmax across all candidates, as Kev does for choice questions, for pages with exactly one answer.
- **Unseen families.** No run got more than 10 of the 18 pages from families held out entirely. This is the open problem, and none of the above targets it directly.
- **Seeds.** Run-to-run variance is estimated by bootstrap, not measured with repeated seeds. Repeated seeds would turn the estimate into a measurement.

## Mistakes worth admitting

- **The wrong diagnosis above.** The fix for the wrong cause was already built and queued when the histogram showed the real one.
- **Calling a deficit real.** g4b's written plan trailed g3 at epochs 1–2, and I said it looked like interference from the checks. By epoch 3 the gap was gone (205 against 206 on the same pages).
- **A stale code copy.** One run trained the wrong format with a too-short token cap, cutting off about 30% of first steps. The review caught it.
- **Understated noise.** I first quoted ±4 points. It is ±6–8.
- **A false gain.** I claimed a drag improvement from 34% to 48% that compared different pages.
- **A misdescribed family.** I called one held-out family unseen. It was the same hexagon puzzle as training pages.
- **An unwatched run.** Reinforcement learning run 3 spent eight rollouts on NaN weights because its only watchdog had exited.

## References

- Kev, an open re-implementation of the Jev decision model: [github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev). TypeSafe's Jev and its System One API are described in TypeSafe's documentation; the outside reconstruction Kev is built on is Archer Hume's "Jev's Architecture Unmasked".
- Qwen3-VL-4B-Instruct: [huggingface.co/Qwen/Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct).
- Hu et al., 2021. LoRA: Low-Rank Adaptation of Large Language Models. [arXiv:2106.09685](https://arxiv.org/abs/2106.09685).
- Shao et al., 2024. DeepSeekMath (GRPO). [arXiv:2402.03300](https://arxiv.org/abs/2402.03300).
- DeepSeek-AI, 2025. DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning. [arXiv:2501.12948](https://arxiv.org/abs/2501.12948).
- Oquab et al., 2023. DINOv2. [arXiv:2304.07193](https://arxiv.org/abs/2304.07193).
- Kahneman, 2011. _Thinking, Fast and Slow_.

_Unless a figure says it comes from a live run, every number is pages right out of pages scored, on held-out pages no run trained on._
