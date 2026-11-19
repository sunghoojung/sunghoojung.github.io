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
8. [References](#references)

## Why captchas

I came to captchas through sneaker Twitter and botting, where they stand between you and a fast checkout on a popular release. Back in 2019, the usual way to solve them was a convolutional neural network (CNN) trained on a big pile of labeled images. That worked until the puzzles changed. Every new format meant a new dataset and a retrain, because the CNNs didn't generalize to puzzles they hadn't seen. For my deep learning final project I came back to the same problem with better tools, to see whether a vision-language model could learn these puzzles from a small amount of data and carry over to new ones.

I picked hCaptcha because it keeps rolling out new kinds of puzzles that take a bit of reasoning. Captchas also check things like mouse movement, IP address and browser details. This project ignores all of that and only tries to answer the puzzle correctly. Each puzzle is a small image with a one-line instruction, and they come in four kinds:

- Picture grids: a 3×3 grid of photos, such as "Pick all objects that melt at room temperature."
- Canvas clicks: a 500×550 scene with many small objects, such as "Find drinks that can be hot or cold."
- Drags: move a piece to where it fits, such as "Drag the letter to the place where it fits."
- Boxes: "Please draw a box around the object that is different."

If you've done an hCaptcha recently, you've probably noticed that the puzzle types keep changing, which is exactly what broke the old CNN approach. I wanted a model that learns them from a few examples and copes with the new ones.

![Example of a drag challenge](pasted-20261119182822.png)

## Setup

A few terms first. A page is one screen of a challenge, and each action on it is a step. A family is a question type, such as "drinks that can be hot or cold". Held-out pages are never trained on. A new-family page comes from a type with no training examples at all, and a seen-family page is a new puzzle of a type the model did train on.

The model is Qwen3-VL-4B-Instruct, a 4-billion-parameter vision-language model. I ran it in bf16 (16-bit) precision and fine-tuned it with LoRA adapters, which are small trainable add-on weights that leave the base model frozen. It fits on a single 16 GB GPU, and a small model makes experiments cheap, so I could find out what works before paying for a bigger one.

For data, I built a recorder that logs every click, drag and box a person makes, lined up frame by frame with what was on screen. Each solved challenge is one episode. I started with about a thousand and ended with 1,368.

For most of the project the model wrote three short lines and then its action. I call this the written plan:

```
Selected: [...]     what is already done
Remaining: [...]    every action still to take, in panel pixels
Target: {...}       the next action
```

The training targets for these lines come straight from the person's recorded actions, so they are right by construction. The first reinforcement learning runs used free-form reasoning instead, and by the end the model writes nothing at all (see [The Jev idea](#the-jev-idea)).

I used two scores. Step accuracy, which only appears in the reinforcement learning section, asks whether one next action is a valid move given what has already been done on the page. Everything after that uses a stricter score, first-step plan right: on a page's first step, the Remaining list has to match the person's actions exactly, in any order. A click counts within 30 px, and a grid click counts on the right tile. A drag counts when the grab is within 30 px and the piece lands within 20 px of where the person's landed. A box counts when it overlaps the person's box by at least half (IoU ≥ 0.5).

![One recorded episode: "Find drinks that can be hot or cold." The person clicked the coffee cup, the mug and the glass, then submitted.](episode-example.png)

The recorder saved each click with the screenshot it was made on: (130, 220), (220, 217) and (393, 375) in panel pixels, then a submit. That one page becomes four training examples, one per step. In the model's text, coordinates are on a 0 to 1000 grid over the panel, so (130, 220) becomes [260, 400]. In each example the model sees that step's screenshot, the question and the actions so far, and learns to write:

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

The `<answer>` line repeats Target, so I've left it off steps 2 to 4. Step 1 is the one the score counts, because its Remaining list is the whole plan for the page. From step 2 on, the points still to do are written a few pixels off the person's clicks (up to 25 px), so the model has to recognize what is already done by looking at the page instead of copying numbers from the history.

The scores are also noisy, and it helps to know by how much before comparing two runs. Re-running the same weights with greedy decoding changed 98 of 225 answers by a coordinate digit, because vLLM's bf16 arithmetic shifts slightly with batching. That alone is worth about ±2 points. A paired bootstrap over challenges put run-to-run differences at about ±6 to 8 points on the 151- and 207-page test sets, and neighboring epochs of one run moved by up to 9 pages even in stable runs. I don't count a gain of a few points as real.

## What plateaued

### GRPO first

I started with reinforcement learning because of DeepSeek-R1-Zero, which applied GRPO (Group Relative Policy Optimization) straight to a base model and watched reasoning emerge on its own. Its AIME 2024 score went from 15.6% to 71%. I underestimated the cost and the chaos. On one 16 GB GPU a single schedule took about 96 hours, and runs broke in strange ways. Reasoning decayed into word salad, answers looped one sentence, weights turned into NaN, and Chinese words crept into English answers, the same "language mixing" the R1 paper reports.

The bigger problem was where I started from. GRPO has the model try the same question several times and pushes it toward the tries that scored better, so it can only reinforce something the model already does some of the time. R1-Zero started from a huge model that already knew math. Mine knew almost nothing about these puzzles. On drags, all 16 tries failed together in every early group, which left nothing to learn from. In run 5, 40 minutes of plain supervised training on 474 steps took step accuracy from 0.31 to 0.71. GRPO then added only 0.04 before drifting, and a later supervised-only run matched it with no reinforcement learning at all. Starting GRPO from my best supervised model hit the same wall from the other side. Its whole-plan score was 0.849 before and after 48 updates, because by then the model got most pages right in all 16 tries and again there was nothing to compare.

Looking back, this is the order the field uses. Even DeepSeek's released R1 was fine-tuned on curated examples before reinforcement learning, partly to fix R1-Zero's language mixing. Reinforcement learning helps once a model succeeds often enough to learn from but still fails some of the time. Until then, more demonstrations helped me more than any reward did.

![Run 5 and the GRPO learning signal](fig-grpo.png "Figure 1. (a) Run 5 on held-out new question families: 40 minutes of supervised training takes the untrained model from 0.31 to 0.71; GRPO peaks at 0.745, level with a supervised-only run, then drifts until its guard stops it. (b) Share of GRPO groups whose 16 tries got different rewards, the only groups GRPO can learn from. It shrinks as the model improves, and starting from the best supervised model it stays at 11 to 39%.")

### Five reasoning formats

With reinforcement learning set aside, I went back to supervised training and asked a simpler question: does it matter what the model writes before its plan? From here on, every number is the stricter score, the whole plan right on a page's first step. I tried five formats:

| Format | What the first step writes | Best score, new / seen families |
| --- | --- | --- |
| v5 | a scene sentence, then the plan | 0.44 / 0.69 |
| v6b | an object list and a rule, plus two other changes | 0.40 / 0.68 |
| v7 | `[x,y] name -> yes/no` for every object | 0.36 / 0.68 |
| v8 | all objects, then a rule sentence, then verdicts | 0.43 / 0.69 |
| v9 | v8 with one `[x,y] -> verdict` line per object | 0.43 / 0.62 |

![Five reasoning formats on the old split, peaking at 65 to 67 of 151 new-family pages](fig1-format-plateau.png "Figure 2. Five written-reasoning formats on the old split, whole first-step plan right per epoch. (a) New question families, 151 pages. (b) Seen families, 207 pages. The best formats peak at 65 to 67 of 151 new-family pages, a tie within noise.")

Switching formats changed which pages were right but left the count about the same. The misses show why. Of v8's 86 misses on new families, 51 were letter drags and hexagon shapes, two families with zero training pages, and no way of writing can teach a puzzle the model has never seen. Those families needed data.

A token count showed why more writing didn't help either. One v8 epoch had 304,523 supervised tokens. 42% described the scene and 46% were bookkeeping copied from earlier lines, which reached near-zero loss after one epoch. Only 12% were the decision itself, so most of the training signal went into memorizing object names and positions.

That left a question: was the model failing to _see_ these puzzles, or seeing them and not using what it saw?

### What the vision tower sees

I spent a day on that question. The vision tower is the part of the model that turns the image into features before the language model reads them.

First, when I asked directly, it could see. I took the best checkpoint from the format runs and asked it plain questions outside its trained format, such as "Point to the loose letter." On new-family letter-drag pages it found the letter 37 times out of 39. Inside its trained reasoning, on the same pages, it found it only 22 times. In the 17 misses it often described a scene that wasn't there ("a purple Y on the left") and then acted on what it had made up. The image features were right, and the text drifted away from them. The other half of a drag, where the letter goes, stayed bad however I asked, at 5 or 6 of 39. That spot is a faint outline, which is harder to see.

Second, its own vision tower beat 21 other image encoders. To measure how much an encoder knows before any training, I took patch features from 22 encoders at three depths and scored them with fixed rules and no training at all. One rule guesses the drop spot as the patch most similar to the piece. Another picks the odd object as the one least similar to the rest, and another picks the matching group as the one most similar to the group already clicked.

![Mean hit rate of 22 vision encoders on seven untrained matching rules](fig-encoders.png "Figure 3. Patch features from 22 vision encoders, scored with seven fixed matching rules and no training (best of raw and blurred per rule, best depth per encoder). Qwen's own tower at three-quarter depth leads at 0.51. Its last layer, the one nearest the language model, falls to 0.26.")

Qwen's tower at three-quarter depth averaged 0.51, ahead of DINOv2-giant at 0.44. Depth mattered more than the choice of encoder. Nearly every encoder did best about three-quarters of the way through, and Qwen's own last layer scored only 0.26. On "the tile that breaks the pattern", the score fell from 0.62 at three-quarter depth to 0.04 at the last layer. A plain cosine-similarity rule with no training found the odd object 93% of the time, on pages where the full model, asked in words, often got it wrong.

Third, blur helped one family. Letter-drag panels are covered in stripes that hide the faint outline of the letter's slot, and a 5 px Gaussian blur wipes the stripes out.

![A letter-drag page as served and after a 5 px Gaussian blur](fig-blur.png "Figure 4. A letter-drag page. (a) As served: the piece (blue) belongs on the faint D under the stripes (red, dashed). (b) After a 5 px Gaussian blur, the stripes are gone.")

With blur, the tower's last layer went from 0.00 to 0.44 on the faint letters, and the full model's "where it fits" went from 5 to 9 of 39. It hurt elsewhere, though. Blur also wipes out the edges of holes, and hole puzzles fell from 14 to 8 of 22.

Fourth, more pixels and a bigger model didn't help. With four times the image tokens, "where it fits" was 3 of 39, and an untrained 8B model got 4. Overall scores at 1×, 2× and 4× tokens were nearly identical.

One caveat came out of the review in the next section. Qwen3-VL already feeds three intermediate vision layers into the language model, so "the last layer loses it" is too simple. The safer claim is that the vision features contain the information and the language side doesn't make full use of it.

## What moved the needle

### Fixing the scoreboard first

After the formats plateaued, I had a separate agent review my method. I gave it read-only access and none of my conclusions, and it found two problems. A third of the "new family" test pages came from two families with no training pages at all, so no change could ever help them. I also wasn't scoring any training pages, which made memorizing look the same as not learning.

So I re-split the data by challenge, 75/25 within every family. Test pages became new puzzles from families the model had trained on, which means the new numbers compare with the old seen-family score (about 0.69), not the new-family 0.43. I also scored a fixed sample of 100 training pages every epoch and switched to plan-only output: just the three lines and the action, with no written reasoning. Plan-only scored the same as the written formats, so the reasoning text wasn't adding anything.

After that, three changes moved the held-out score, in this order.

![The same 310 held-out pages with old and new data, and all 397 held-out pages for g1, g2 and g3](fig-needle.png "Figure 5. (a) The same 310 held-out pages and the same plan-only recipe, trained on the old data and on more data. (b) All 397 held-out pages for g1 (more data), g2 (adds a decision-weighted loss, vision LoRA, a cosine schedule and shift/scale augmentation) and g3 (g2 plus a pointing head).")

### More data

By now I had 1,082 training pages and 397 held-out pages. Every challenge held out before stayed held out, so old and new runs can be compared on the same pages. The first run, g1, used the same recipe on the bigger data. On the 310 test pages both runs shared, it got 18 to 21 more pages right than the old data at every epoch from 2 to 5, and the best scores were 223 against 211. Families that had no training pages before now had some, and they started to work. Hexagon puzzles went from 5 of 48 to 35 with 56 training pages instead of none. g1 was unstable, though. Its hexagon score went 5, 19, 31, 35, 25, 20, 38, 13 across epochs, and the overall score swung from 0.72 to 0.60 and back. A constant learning rate was too jumpy for this data.

### A better loss and a schedule

g2 changed four things at once. The loss counted the decision (the Remaining list) four times as much as the bookkeeping copied from earlier lines, and coordinates got soft targets, so a guess 1 pixel off cost less than one 100 pixels off. The vision tower was trained too, with its own LoRA at a learning rate of 1e-4. The learning rate followed a cosine schedule down to zero instead of staying constant. And half the training images were resized and moved, with their coordinates adjusted to match, so the model couldn't memorize where things sit.

g2 climbed steadily to 0.844 (335 of 397), the best written-plan score up to then, and letter drags went from 12 to 17 of 29. Because all four changes landed together, I can't say which one did it.

### A pointing head

g3 added one small piece during training: a pointing head that reads the image tokens halfway up the language model (layer 18) and learns to point at the patches the person clicked. In g3 the head's output isn't used for answers. Its loss gives the vision side a direct signal about where things are. (In TEV, below, the same head is how the model answers "where".) g3 reached 0.839 by epoch 4, where g2 needed until epoch 7 for 0.844, so it tied three epochs sooner. On held-out pages the head pointed at the right patch 97 to 98% of the time. g2 and g3 each got about 30 pages the other missed, and between them they got 364 of 397 (92%), so the model often had the answer without producing it.

The 18 pages from the two families held out entirely never improved. Every run got between 2 and 10 of them right. The model can handle some puzzles of a kind it has never seen, but none of these changes made it better at that, and every gain above came on families it had trained on.

## The Jev idea

### The written plan was too slow

The first time I let the model play a real widget, I mostly sat there waiting. It got the screenshot, and then for five, ten, sometimes thirty seconds nothing happened while it typed out its plan one token at a time: the Selected line, the Remaining line, every coordinate digit by digit. Over the live challenges I timed, the written plan took a median of 12.4 seconds of model time per challenge, and the slowest took more than a minute. A person clears the same page in two or three seconds.

Looking at the picture was quick. By the time the model started writing, it had already seen the page and, in a sense, already made up its mind, so nearly all of the wait was the model spelling that decision out as text.

I was complaining about this to a friend, and they told me to look at system one decision models like Jev. The term comes from Kahneman's two kinds of thinking. System two is slow and deliberate, and system one is the quick gut answer you give without talking yourself through it. My written plan was pure system two, narrating every page before touching it, and a captcha needs system one: look once and answer.

### What Jev is

Jev is TypeSafe's hosted decision model. You send it a piece of text and a few short questions (yes/no, pick one, a score). It reads the text once and answers every question straight from its hidden states, with calibrated probabilities and no generated text. Kev is Jared Palmer's open re-implementation ([github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev)), built from an outside reconstruction of Jev: a Qwen backbone, a LoRA adapter and a small pointer head.

Its design carries straight over to puzzles. The shared input is read once and cached. Each question is a short branch that sees that input and its own tokens but none of the other questions, so adding a question doesn't change the other answers. And every answer is a probability over options you supply, so the model can only pick one of them.

I built my own version for puzzle pages and called it TEV. The shared input is the panel's image tokens, the instruction and the actions so far, and everything the model has to decide becomes a short question that branches off that one cached reading.

![How TEV answers a page: one pass reads it, short questions branch off the cache](fig-tev-diagram.png "Figure 6. How TEV answers a page. One pass reads the screenshot and caches it. Each short question branches off that cache: the words (which action, how many, yes or no) come from next-word probabilities, and the places come from the pointer head. A small planner turns the readouts into mouse actions, and no text is generated. This is the version I ran live at the end; the Action question and the box corners came after the first versions below.")

I made two choices that differ from Kev. The yes/no answer is read from the language model's own `" yes"` and `" no"` token probabilities, renormalized over the two, instead of from a new head. And the written plan is still trained in the same run, so I can compare every readout against it on the same pages.

### Pointing with a query and a key

Words are easy to read out, because a language model already has a probability for every possible next word. "Action:" asks which of click, drag and box it thinks comes next, and "How many:" asks the same thing over the digits 0 to 9. Places are harder. Writing "x=412, y=230" out as text was the slow part I wanted to get rid of.

For places, TEV borrows how attention works. Inside a transformer, every token makes a query vector and a key vector, and the dot product of one token's query with another token's key decides how much the first looks at the second. A dot product is biggest when two vectors point the same way, so whichever key is closest to the query wins.

The pointing head from g3 is one more head of that shape. Its query `q` is the hidden state of the question's last token, say the token for "Top-left:", at layer 18. Its keys `k_i` are the hidden states of the 440 image patches at the same layer, each covering about 25 px of the panel. Both are normalized and squeezed down to 256 numbers by a small learned matrix, and every patch gets a score:

```text
score_i = (W_q · q) · (W_k · k_i) / √256
```

A softmax over the 440 scores turns them into a heat map over the page. A normal attention head would use those weights to blend information from the patches. Here the weights are the answer, showing where the model looks when you ask it for "Top-left", and the hottest patch is the point.

Training it was almost boring. For every human demonstration the target is a small soft blob, about one patch wide, centered on the point the person actually used, and the loss is the cross-entropy between that blob and the heat map. The head starts out nearly flat (its query weights begin 100 times smaller than its keys), so bolting it on changes nothing until it has learned something.

![A live box drawn from two pointer questions](fig-pointer.png "Figure 7. A box drawn live from two pointer questions, on \"Please draw a box around the animal that hatches from an egg.\" (a) \"Top-left:\" puts 0.13 of all its weight on a single patch, and (b) \"Bottom-right:\" puts 0.16 on one. Spread evenly, each patch would get 0.002. (c) The box between the two peaks, around the lizard. The widget passed it.")

### Yes/no checks

A click question can have one right answer or five, so one pointer isn't enough. TEV makes a short list of candidate spots and asks about each one, "Check [x,y] ->", read as the probability of " yes" against " no". A picture grid has nine fixed tile centers. A canvas uses the pointer head's 16 best peaks, spaced apart and refined to the center of their local heat.

The training labels come from the person's actions, so none of this needed new labeling. A candidate near a click is a yes, the number of clicks is the count, and the grab and drop points answer the drag questions.

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

`prefix` holds the prompt's cached keys and values. Each branch is its own row in the batch, so branches can't attend to each other. The `digits` argument reuses the soft-digit readout path with two token ids instead of ten, and the loss is a two-way cross-entropy against the label.

On one live page (Figure 8), eight of the sixteen candidates landed on the globe and came back yes at about 1.0, and the other eight came back at 0.01 or less. Eight yeses on one object is a problem I walked straight into with the first version (next section), and it's why TEV merges nearby yeses and asks "How many:". The count said 1, so it played one click.

![One live click decision: 16 candidate spots, 8 yes, all on the globe](fig-readout.png "Figure 8. One live click decision, \"Identify the item that spins in a circle.\" (a) The 16 candidate spots. The 8 that said yes all sit on the globe, and one click was played. (b) p(yes) for each spot, sorted. Action said click with p = 1.00 and How many said 1. No text was generated.")

### Was it actually faster?

Yes, by a lot. In the live runs at the end of the project, the median challenge went from 12.4 seconds of model time to 1.2, about ten times faster, and each decision went from 5.0 seconds to 0.72.

![Model time per live challenge: written plan against TEV](fig-speed.png "Figure 9. Model time per live challenge, log scale. The written plan took a median of 12.4 s over 15 challenges; TEV took 1.2 s over 337.")

I only timed 15 live challenges on the written plan, so treat that number as rough. Still, the two clouds don't overlap at all: the written plan's fastest challenge took longer than TEV's slowest.

Speed was the reason I started, but I still had to find out whether reading answers out is as accurate as writing them. The next two sections are me finding that out the hard way.

## TEV versions, and how the first one failed

Every version below is trained together with the written plan, so each readout is compared with the plan on the same held-out pages.

### g4: grids worked, canvas collapsed

g4 is g3 plus the yes/no checks. After epoch 1, on the 242 held-out first steps whose answer is clicks, the checks got 55 of 62 grids against the written plan's 50, and 95 of 180 canvas pages against its 146.

After epoch 2, grids were 59 of 62 for both. Canvas _fell_ to 52 of 180, while the written plan rose to 154. On 114 of the 180 canvas pages the checks chose too many targets, even though they were about 99% right on training pages.

### A wrong diagnosis

The first explanation I came up with was neat. In g4, a canvas training page got three kinds of candidates: the person's points with a little jitter (yes), raw head peaks (no) and random points (no). Each kind has its own coordinate pattern, so maybe the branches had learned to tell a candidate's _source_ from its numbers, which is useless on held-out pages where every candidate is a refined peak. I built the fix, which made training candidates exactly the way held-out ones are made.

Then I looked at where the wrong yeses actually were.

![Distance from wrongly passed candidates to the nearest target, and canvas pages right by epoch](fig4-rim-failure.png "Figure 10. (a) g4 at epoch 2: of 988 wrongly passed canvas candidates, 898 sat within 60 px of a real target, mostly 30 to 60 px away. Only 50 were more than 90 px away. (b) Canvas pages right. g4 used candidates 40 px apart and merged passing points within 45 px. g4b used 60 px spacing, left the rim band out of training and merged within 75 px.")

A source shortcut would put wrong yeses anywhere on the page. Almost all of these were 30 to 60 px from a target, on the edge of the _same_ object. With candidates 40 px apart and passing points merged only within 45 px, one object gave two or three yeses, and each became a separate click. The model was right that the object was a target, and the readout counted it more than once.

Re-scoring g4's saved epoch-2 answers with only a 75 px merge lifts canvas from 52 to about 97 of 180, with no retraining.

### g4b: one candidate per object

g4b keeps the peak-made training candidates and adds the fix the data called for. In the settings below, `nms_px` is the spacing between candidates, `exclude_px` is how far a candidate has to be from every target to count as a no, and `merge_px` is the radius within which passing points count as one object:

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

The model still says yes to rims. At epoch 7, 676 of g4b's 765 wrong yeses are within 60 px of a target. The merge turns them into one click, though, and canvas pages with too many clicks fell from 114 (g4, epoch 2) to 5 (g4b, epoch 7).

g4b's written plan, trained alongside, reached 0.846 (336 of 397) at epoch 7. That's one page above g2, which is a tie.

### g4c: a count question

On g4b's canvas pages, a common miss was the wrong number of targets. g4c adds one more branch, `How many:`, answered by one digit and trained against the number of clicks. At decision time it clicks the N likeliest merged candidates.

After epoch 4 of 8, the count is right on 176 of 180 canvas pages (98%) but only 56 of 62 grids (90%). It helps canvas a little (148 of 180, against 144 with the plain 0.5 threshold) and hurts grids (56 against 60). Its written plan is at 0.839 (333 of 397), level with the others.

## Findings

### Grids: the checks win

![Checks against the written plan on grids and canvas, and how often the checks pass the plan's points](fig5-checks-vs-written.png "Figure 11. (a, b) Checks against the written plan on the same held-out first steps. Grids: the checks match or beat the plan at every epoch, and g4c reaches 60 of 62. Canvas: the checks peak at 151 of 180 (g4b, epoch 4) while the plan holds 155 to 158 from epoch 4. (c) On g4b's epoch-7 checkpoint, the checks pass 398 of 399 of the plan's correct canvas points and 14 of its 19 wrong ones.")

On picture grids the checks are level with or above the written plan at every epoch, at 58 of 62 from epoch 4 on and 60 of 62 in g4c. A grid is the easiest case for them, with nine fixed candidates, nothing to point at, and one yes/no each.

### Canvas: the checks never caught up

On canvas the checks never caught the written plan: 151 against 157 at g4b's epoch 4, and 149 against 158 at epoch 7. I tried every combination I could think of offline, and on canvas alone none beat the written plan. Over all 242 click and grid pages, the best one ("written plan minus the points the checks reject") gained two or three pages, most of them on grids.

A direct test settled it. On g4b's epoch-7 checkpoint I used the written plan's own points as the candidates. The checks passed 398 of its 399 correct points and 14 of its 19 wrong ones. Scored as pages, checks over the written points gave 156, checks over written points plus peaks 156, peaks alone 149, and the written plan 158.

So the yes/no readout and the written plan share the same beliefs, and when the plan is wrong the checks usually agree with it. The canvas errors that remain come from what the model sees. The rest of the gap is candidates: from epoch 4 on, 5 to 13 canvas pages per epoch had a target that no candidate landed on.

### Drags: early numbers

![Grab and landing error distributions for drag where-questions](fig6-drag-errors.png "Figure 12. Drag \"where\" questions on 110 held-out single-drag pages (g4f, epochs 1 and 2). (a) Grab error: 87 of 110 within the 30 px grab radius at epoch 1, 76 at epoch 2. (b) Landing error: 44 of 110 within 20 px at both epochs.")

A drop spot, like a faint hole, is hard to list as candidates in advance, so for drags g4f asks two pointer questions, `Piece:` and `Drop:`. Each is a short branch whose last token becomes the pointer head's query over every image patch (from the trainer, trimmed):

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

The model usually finds the right piece and then misses where it goes. The 20 px landing tolerance is smaller than one image patch, which covers about 25 px of the panel. The two readouts fail on different pages, so combining them should help.

On these drag pages, g4f's own written plan (45, then 54) trailed g4b's at the same epochs (67, then 68). The where loss might be interfering with written drags, or it might be early-epoch noise like g4b's slow start, and two epochs aren't enough to tell.

g4e adds a blurred copy of the panel as a second image, aimed at the faint letters. I only have its first epoch (0.662 written, 59 of 62 grid checks), which is too early to say anything.

## References

- Kev, an open re-implementation of the Jev decision model: [github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev). TypeSafe's Jev and its System One API are described in TypeSafe's documentation; the outside reconstruction Kev is built on is Archer Hume's "Jev's Architecture Unmasked".
- Qwen3-VL-4B-Instruct: [huggingface.co/Qwen/Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct).
- Hu et al., 2021. LoRA: Low-Rank Adaptation of Large Language Models. [arXiv:2106.09685](https://arxiv.org/abs/2106.09685).
- Shao et al., 2024. DeepSeekMath (GRPO). [arXiv:2402.03300](https://arxiv.org/abs/2402.03300).
- DeepSeek-AI, 2025. DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning. [arXiv:2501.12948](https://arxiv.org/abs/2501.12948).
- Oquab et al., 2023. DINOv2. [arXiv:2304.07193](https://arxiv.org/abs/2304.07193).
- Kahneman, 2011. _Thinking, Fast and Slow_.

_Unless a figure says it comes from a live run, every number is pages right out of pages scored, on held-out pages no run trained on._
