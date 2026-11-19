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

1. [Exploring CAPTCHA Challenges: A Deep Learning Approach](#exploring-captcha-challenges-a-deep-learning-approach)
2. [Setup](#setup)
3. [What plateaued](#what-plateaued)
4. [What moved the needle](#what-moved-the-needle)
5. [The Jev idea](#the-jev-idea)
6. [Jev versions, and how the first one failed](#jev-versions-and-how-the-first-one-failed)
7. [Findings](#findings)
8. [Lessons](#lessons)
9. [What is next](#what-is-next)
10. [Mistakes worth admitting](#mistakes-worth-admitting)
11. [References](#references)

## Exploring CAPTCHA Challenges: A Deep Learning Approach

Having a background in sneaker Twitter and botting, I've always found CAPTCHAs intriguing. These challenges serve to thwart bots and protect websites, particularly in my sphere, where they complicate quick purchases for very popular items. Historically, methods for solving CAPTCHAs relied heavily on convolutional neural networks (CNNs) that were trained on extensive datasets of images. However, I observed that as CAPTCHA formats evolved, these CNNs often struggled to generalize, becoming ineffective in solving novel challenges without extensive retraining on new datasets. This realization dates back to 2019, and I'm excited to return to this problem with fresh knowledge and a clearer understanding of CNN limitations.

I chose to focus on hCaptcha for my experiments, as it regularly introduces new challenges that require reasoning and adaptability. While CAPTCHAs track various user behaviors, like mouse movements and IP addresses, data about your specific browser, my primary focus for this deep learning final project is tackling the difficulty of solving these challenges.\
hCaptcha serves out these puzzles with a small images with a one-line instruction. There are four kinds:

- **Picture grids.** A 3×3 grid of photos: "Pick all objects that melt at room temperature."
- **Canvas clicks.** A 500×550 scene with many small objects: "Find drinks that can be hot or cold."
- **Drags.** Move a piece to where it fits: "Drag the letter to the place where it fits."
- **Boxes.** "Please draw a box around the object that is different."

If you've encountered hCaptcha, you recognize the challenge of solving certain tasks as they continuously roll out new types of puzzles. My aim is to train a model that can effectively generalize to these new challenges with minimal data.

![Example of a drag challenge](pasted-20261119182822.png)

## Setup

**Terms.** A page is one screen of a challenge, and each action on it is a step. A family is a question type, such as "drinks that can be hot or cold". Held-out pages are never trained on. A new-family page is a type with no training examples at all; a seen-family page is a new puzzle of a type the model trained on.

**Model.** Qwen3-VL-4B-Instruct in bf16, trained with LoRA adapters. I chose it because it fits my dataset and a single 16 GB GPU, and because a small model makes ablations cheap: I can find out what works here before spending time and money on a bigger one.

**Data.** I built a recorder that logged every click, drag and box a person made, frame-aligned to what was on screen. Each solved challenge became one "episode." I started with about a thousand and ended with 1,368.

**Output.** For most of the project the model wrote three short lines and then its action:

```
Selected: [...]     what is already done
Remaining: [...]    every action still to take, in panel pixels
Target: {...}       the next action
```

The training targets for these lines come straight from the human's recorded actions, so they are right by construction. The first RL runs used free-form reasoning instead, and by the end the model writes nothing at all (see "Read it out").

**Metrics.**

- _Step accuracy_ (the RL section only): is this one next action a valid move depending on the current state.
- _First-step plan right_ (everything after): on a page's first step, the Remaining list must match the human's actions exactly, in any order. A click counts within 30 px. A grid click counts on the right tile. A drag counts when the grab is within 30 px and the piece lands within 20 px of where the human's landed. A box counts when it overlaps the human's box by at least half (IoU ≥ 0.5).

![One recorded episode: "Find drinks that can be hot or cold". The person clicked the coffee cup, the mug and the glass, then submitted.](episode-example.png)

The recorder saved each click with the screenshot it was made on: (130, 220), (220, 217) and (393, 375) in panel pixels, then a submit. That one page becomes four training examples, one per step. In each, the model sees that step's screenshot, the question and the actions so far, and learns to write:

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

Coordinates are on a 0–1000 grid over the panel. Step 1 is the one the metric scores: its Remaining list is the whole plan for the page. From step 2 on, the plan is carried in the prompt with each point restated a few pixels off the person's click (up to 25 px), so the model has to recognize what is already done by where it is, not by copying numbers from the history.

**Noise.** vLLM's bf16 arithmetic changes with batching. Re-running the same weights greedily changed 98 of 225 answers by a coordinate digit, about ±2 points of noise from arithmetic alone.
\- A paired bootstrap over challenges put run-to-run differences at about ±6–8 points on the 151- and 207-page splits.
\- Neighbouring epochs of one run move by up to 9 pages, even in the stable runs.

## What plateaued

### GRPO first

I started with reinforcement learning because of DeepSeek-R1-Zero, which applied GRPO straight to a base model and watched reasoning emerge on its own (AIME 2024 went from 15.6% to 71%). I underestimated the cost and the chaos. On one 16 GB GPU a single schedule took about 96 hours, and runs broke in strange ways: reasoning decayed into word salad, answers looped one sentence, weights turned into NaN, and Chinese words crept into English answers, the same "language mixing" the R1 paper reports.

The deeper problem was the starting point. GRPO compares several answers to the same question and pushes toward the better ones, so it can only reinforce what a model already does some of the time. R1-Zero started from a huge model that already knew math. Mine knew almost nothing about these puzzles: on drags, all 16 tries failed together in every early group, leaving nothing to learn from. In run 5, 40 minutes of plain supervised training on 474 steps took step accuracy from 0.31 to 0.71. GRPO then added only 0.04 before drifting, and a later supervised-only run matched it with no RL at all. GRPO from my best supervised model hit the same wall from the other side: its whole-plan score was 0.849 before and after 48 updates, because the model now passed most rows in all 16 tries.

Looking back, this is the order the field uses. Even DeepSeek's released R1 was fine-tuned on curated examples before RL, partly to fix R1-Zero's language mixing. RL is worth it once a model succeeds often enough to learn from, but not reliably. Before that, more demonstrations do more than any reward.

![Run 5 and the GRPO learning signal](fig-grpo.png "Figure 1. (a) Run 5 on held-out new question families: 40 minutes of supervised training takes the untrained model from 0.31 to 0.71; GRPO peaks at 0.745, level with a supervised-only run, then drifts until its guard stops it. (b) Share of GRPO groups whose 16 tries got different rewards, the only groups GRPO can learn from. It shrinks as the model improves, and starting from the best supervised model it stays at 11–39%.")

**Five reasoning formats, one ceiling**

With RL set aside, I went back to supervised training and asked a simpler question: does it matter what the model writes before its plan? From here on, every number is the stricter score, the whole plan right on a page's first step. I tried five formats:

| Format | What the first step writes | Best new / seen |
| --- | --- | --- |
| v5 | a scene sentence, then the plan | 0.44 / 0.69 |
| v6b | an object list and a rule, plus two other changes | 0.40 / 0.68 |
| v7 | `[x,y] name -> yes/no` for every object | 0.36 / 0.68 |
| v8 | all objects, then a rule sentence, then verdicts | 0.43 / 0.69 |
| v9 | v8 with one `[x,y] -> verdict` line per object | 0.43 / 0.62 |

![Five reasoning formats on the old split, peaking at 65 to 67 of 151 new-family pages](fig1-format-plateau.png "Figure 2. Five written-reasoning formats on the old split, whole first-step plan right per epoch. (a) New question families, 151 pages. (b) Seen families, 207 pages. The best formats peak at 65 to 67 of 151 new-family pages, a tie within noise.")

The formats changed which pages were right, not how many. The misses explain why. Of v8's 86 misses on new families, 51 were letter drags and hexagon shapes, two families with zero training pages. No way of writing can teach a puzzle the model has never seen. From here I decided I needed to gather more data for these underseen challenges.

A token count showed why more writing didn't help either. In one v8 epoch there were 304,523 supervised tokens: 42% described the scene, 46% were bookkeeping copied from earlier lines, which reached near-zero loss after one epoch, and only 12% were the decision itself. Most of the gradient went into memorising object names and positions, not into choosing.

That left one question: was the model failing to *see* these puzzles, or seeing them and not using what it saw?

### The eyes see more than the words use

I spent a day focusing on the vision aspect, posing a single question: when the model gets a puzzle wrong, is it because it cannot see the answer, or because it sees it but fails to utilize it? I found four results along with a caveat.

**Asking questions differently can lead to better outcomes.** I took the best model checkpoint from the format runs and posed straightforward questions outside of its trained format, such as, "Point to the loose letter." On new-family letter-drag pages, it correctly identified the letter in 37 out of 39 instances. However, when working within its trained reasoning on the same pages, it only identified the correct letter in 22 of 39 tries. Reviewing the 17 errors, I found that the model often generated a scene that was not present ("a purple Y on the left") and then acted on what it had imagined. While the image was accurate, the text deviated from it. Unfortunately, in the second half of the drag, where the letter fits, the model performed consistently poorly, achieving only 5 or 6 correct answers out of 39 regardless of how I phrased the question. This aspect may require a faint outline, which presents a different challenge.

**The model's own vision tower ranks as the best among 22 encoders.** To assess how much a vision encoder already knows, I extracted patch features from 22 encoders at three different depths and evaluated them using fixed criteria without any training: the drop spot was identified as the patch most similar to the piece; the odd object was the one least similar to the rest; and a matching cluster was identified as the one most similar to the clicked cluster.

![Mean hit rate of 22 vision encoders on seven untrained matching rules](fig-encoders.png "Figure 3. Patch features from 22 vision encoders, scored with seven fixed matching rules and no training (best of raw and blurred per rule, best depth per encoder). Qwen's own tower at three-quarter depth leads at 0.51. Its last layer, the one nearest the language model, falls to 0.26.")

Qwen's tower at a three-quarter depth averaged 0.51, outperforming the DINOv2 giant, which scored 0.44. Depth proved to be more significant than the choice of model; nearly every encoder performed best at around three-quarter depth, while Qwen's own last layer scored only 0.26. On the task of identifying "the tile that breaks the pattern," the score dropped from 0.62 at three-quarter depth to 0.04 at the last layer. Notably, a simple rule, such as plain cosine similarity without any training, successfully identified the odd object 93% of the time across various pages, whereas the full model, when asked in words, failed on many of those same pages.

**Blurred images improved performance for one family of tasks.** Letter-drag panels are often obscured by stripes that hide the faint outline of the letters they contain. Applying a 5 px Gaussian blur eliminated these stripes.

![A letter-drag page as served and after a 5 px Gaussian blur](fig-blur.png "Figure 4. A letter-drag page. (a) As served: the piece (blue) belongs on the faint D under the stripes (red, dashed). (b) After a 5 px Gaussian blur, the stripes are gone.")

With the blurred faint letters, the tower's last layer score increased from 0.00 to 0.44, and the overall model's performance in identifying "where it fits" rose from 5 to 9 out of 39. However, blurring proved to be ineffective in other areas; it removed the edges of holes, leading to poorer performance on hole puzzles (from 14 correct answers to only 8 out of 22).

**Increasing size and resolution didn't yield better results.** When the image tokens were quadrupled, the "where it fits" performance remained at just 3 out of 39, while an untrained 8B model achieved only 4. Overall scores for 1×, 2×, and 4× tokens were nearly indistinguishable, indicating that more pixels and a larger model were not the solution.

One important caveat arose during the review in the next section. Qwen3-VL already incorporates three intermediate vision layers into the language model, not just the last one. Therefore, the claim that "the last layer loses it" oversimplifies the issue. The surviving assertion is more specific: the relevant information resides in the vision features, which the language side does not adequately utilize.

## What moved the needle

After the formats plateaued, a separate agent reviewed my method and granted read-only access without drawing any conclusions. One-third of the "new family" test pages originated from two families that had no training pages at all. Since there was no scoring for the training pages, it appeared that memorization looked the same as not learning. I re-split the data by challenge, using a 75/25 ratio within every family. As a result, the test pages became **new puzzles from families that the model had already seen**. These numbers were compared with the old _seen_ scores (about 0.69), rather than the new-family score of 0.43. I also scored a fixed sample of 100 training pages during each epoch and switched to **plan-only** output: just the three lines and the action taken, without any written reasoning. The plan-only output matched the written formats, indicating that the reasoning text provided no additional benefit. After making these changes, the held-out score improved.

Three changes moved the held-out score after that, in this order.

![The same 310 held-out pages with old and new data, and all 397 held-out pages for g1, g2 and g3](fig-needle.png "Figure 5. (a) The same 310 held-out pages and the same plan-only recipe, trained on the old data and on more data. (b) All 397 held-out pages for g1 (more data), g2 (adds a decision-weighted loss, vision LoRA, a cosine schedule and shift/scale augmentation) and g3 (g2 plus a pointing head).")

**More data**. At this point, I had 1,082 usable challenges: 1,082 training pages and 397 held-out pages. Every challenge that had been held out before remained excluded, allowing for direct comparisons between old and new runs. The first run, labeled g1, applied the same recipe on the new data. On the 310 pages that both test sets shared, it correctly answered 18 to 21 more pages than the old data at every epoch from 2 to 5; the best scores compared were 223 against 211. Families that previously had no training pages now had some, and they began to improve: hexagon puzzles, for instance, grew from 5 correct answers out of 48 to 35, thanks to having 56 training pages instead of none. However, g1 proved unstable, with hexagon scores fluctuating between 5, 19, 31, 35, 25, 20, 38, and 13 across epochs, and the overall score shifted from 0.72 to 0.60 and back. A constant learning rate was too erratic for this data.

**A better loss, the eyes, a schedule.** G2 incorporated four changes simultaneously. The loss function assigned four times the weight to the decision (the Remaining list) compared to the bookkeeping the model copied from earlier lines. It used "soft" digit targets, where a coordinate 1 pixel off incurred less penalty than one 100 pixels off. The vision tower was also trained, this time at a learning rate of 1e-4. Additionally, the learning rate followed a cosine schedule, gradually decreasing to zero. Furthermore, half of the training images were resized and repositioned, with their coordinates adjusted accordingly, so the model could not rely on memorizing static placements. G2 steadily climbed to a score of 0.844 (335 correct out of 397), achieving the highest score of any write-it-out run, and letter drags increased from 12 to 17 out of 29. Since all four changes were made simultaneously, I cannot attribute the improvement to any single change.

**A pointing head.** G3 introduced one small addition during training. It reads the image tokens halfway through the language model (layer 18) and learns to point at the patches clicked by the user. This mechanism is not used to provide answers; it simply offers the vision component a direct signal about patch locations. By epoch 4, G3 reached a score of 0.839, whereas G2 required epoch 7 to reach 0.844; this resulted in a tie, but G3 achieved it three epochs earlier. On held-out pages, the pointing mechanism identified the correct patch 97-98% of the time. G2 and G3 each successfully identified about 30 pages that the other missed, achieving a combined coverage of 364 out of 397 (92%). The model frequently knew the correct answer but did not always produce it.

One number never improved. On the 18 pages from the two families held out entirely, every run got between 2 and 10 right. So the model can handle some puzzles of a kind it has never seen, but none of these changes made it better at that: every gain above came on families it had trained on.

## The Jev idea

**Jev** is TypeSafe's hosted decision model. You send a piece of text and a set of short questions (yes/no, pick one, a score). It reads the text once and answers every question from its hidden states, with calibrated probabilities and no generated text. **Kev** is Jared Palmer's open re-implementation ([github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev)), built from an outside reconstruction of Jev: a Qwen backbone, a LoRA adapter and a small pointer head.

Three ideas matter here:

1. **Read once.** The shared input is processed one time and cached.
2. **Questions cannot see each other.** Each question is a short branch that sees the shared input and its own tokens only, so adding a question does not change the others.
3. **Answers are probabilities, not text.** The model can only pick from the options you give it.

For a puzzle page, the shared input is the panel's image tokens plus the instruction and the previous actions. The questions become:

```text
[image tokens] [instruction] [history]   read once, cache keys/values
  ├─ "Check [158,312] ->"   p(" yes") vs p(" no")
  ├─ "Check [500,312] ->"   ... one per candidate point
  ├─ "How many:"            p("0") ... p("9")
  ├─ "Piece:"               pointer over patches: what to grab
  └─ "Drop:"                pointer over patches: where it goes
```

I made two choices that differ from Kev. The yes/no answer is read from the language model's _own_ `" yes"` and `" no"` token logits, renormalised over the two, rather than a new head. And the written plan is still trained in the same run, so every readout is compared with it on the same pages.

The candidates differ by page type. A picture grid has nine fixed tile centres. A canvas uses the pointer head's 16 best peaks, spaced apart and refined to the centre of their local heat.

The training labels come from the human's actions. A candidate near a click is a yes, the number of clicks is the count, and the grab and drop points answer the drag questions. No new labelling.

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

## Jev versions, and how the first one failed

### g4: grids worked, canvas collapsed

g4 is g3 plus the checks. After epoch 1, on the 242 held-out first steps whose plan is clicks:

- **Grids:** checks 55 of 62, written plan 50.
- **Canvas:** checks 95 of 180, written plan 146.

After epoch 2, grids were 59 of 62 for both. Canvas _fell_ to 52 of 180, while the written plan rose to 154. On 114 of the 180 canvas pages the checks chose too many targets. Training checks were about 99% right.

### A wrong diagnosis

The first explanation was neat. In g4, a canvas training page got three kinds of candidates: the human's points with a little jitter (yes), raw head peaks (no) and random points (no). Each kind has its own coordinate pattern. So maybe the branches had learned to tell a candidate's _source_ from its numbers, which is useless on held-out pages where every candidate is a refined peak. I built the fix: make training candidates exactly the way held-out ones are made.

Then I looked at where the wrong yeses actually were.

![Distance from wrongly passed candidates to the nearest target, and canvas pages right by epoch](fig4-rim-failure.png)

_Figure 4. (a) g4 at epoch 2: of 988 wrongly passed canvas candidates, 898 sat within 60 px of a real target, mostly 30-60 px away. Only 50 were more than 90 px away. (b) Canvas pages right. g4 used candidates 40 px apart and merged passing points within 45 px. g4b used 60 px spacing, left the rim band out of training and merged within 75 px._

A source shortcut would produce yeses anywhere. These were not anywhere. Almost all were 30-60 px from a target: the edge of the _same_ object. With candidates 40 px apart and passing points merged only within 45 px, one object gave two or three yeses, and each became a separate click. The model was not wrong that the object was a target. The readout counted it twice.

Re-scoring g4's saved epoch-2 branches with only a 75 px merge lifts canvas from 52 to about 97 of 180, with no retraining.

### g4b: one candidate per object

g4b keeps the peak-made training candidates and adds the fix the data called for:

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

After epoch 4 of 8, the count is right on 176 of 180 canvas pages (98%) but only 56 of 62 grids (90%). It helps canvas a little (148 of 180 against 144 for the 0.5 cut) and hurts grids (56 against 60). Its written plan is at 0.839 (333 of 397), level with the others.

## Findings

### Grids: the checks win

![Checks against the written plan on grids and canvas, and how often the checks pass the plan's points](fig5-checks-vs-written.png)

_Figure 5. (a, b) Checks against the written plan on the same held-out first steps. Grids: the checks match or beat the plan at every epoch, and g4c reaches 60 of 62. Canvas: the checks peak at 151 of 180 (g4b, epoch 4) while the plan holds 155-158 from epoch 4. (c) On g4b's epoch-7 checkpoint, the checks pass 398 of 399 of the plan's correct canvas points and 14 of its 19 wrong ones._

On picture grids the checks are level with or above the written plan at every epoch, 58 of 62 from epoch 4 on and 60 of 62 in g4c. A grid is the ideal case: nine fixed candidates, no localisation, one yes/no each.

### Canvas: limited by perception, not readout

On canvas the checks never caught the written plan: 151 against 157 at g4b's epoch 4, and 149 against 158 at epoch 7. I tried every combination I could think of offline. On canvas alone, none beat the written plan. Over all 242 click and grid pages, the best one ("written plan minus the points the checks reject") gained two or three pages, most of them on grids.

The direct test settled it. On g4b's epoch-7 checkpoint I used the written plan's own points as the candidates. The checks passed 398 of its 399 correct points and 14 of its 19 wrong ones. Scored as pages, checks over the written points gave 156, checks over written points plus peaks 156, peaks alone 149, and the written plan 158.

So the yes/no readout and the written plan come from the same beliefs. When the plan is wrong, the checks usually agree with it. What remains on canvas is about what the model sees, not how the answer is read. The rest of the gap is candidates: from epoch 4 on, 5-13 canvas pages per epoch had a target that no candidate landed on.

### Drags: in progress

![Grab and landing error distributions for drag where-questions](fig6-drag-errors.png)

_Figure 6. Drag "where" questions on 110 held-out single-drag pages (g4f, still training). (a) Grab error: 87 of 110 within the 30 px grab radius at epoch 1, 76 at epoch 2. (b) Landing error: 44 of 110 within 20 px at both epochs._

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

Partial results, epochs 1 and 2 of 8:

|  | Epoch 1 | Epoch 2 |
| --- | --- | --- |
| Where questions right | 43 / 110 | 39 / 110 |
| Written plan right, same pages | 45 / 110 | 54 / 110 |
| Either right | 64 / 110 | 61 / 110 |
| Grab within 30 px | 87 / 110 (79%) | 76 / 110 (69%) |
| Landing within 20 px | 44 / 110 (40%) | 44 / 110 (40%) |
| Median grab / landing error | 16 / 29 px | 22 / 24 px |

The model usually finds the right piece. The landing is the bottleneck: the 20 px tolerance is smaller than one image token, which covers about 25 px of panel at this resolution. The two readouts fail on different pages, so combining them has room.

One worry. g4f's own written plan on these drag pages (45, then 54) trails g4b's at the same epochs (67, then 68). The where loss may be interfering with written drags, or it may be early-epoch noise like g4b's slow start. I will know by epoch 3 or 4.

g4e adds a blurred copy of the panel as a second image, aimed at the faint letters. It is at epoch 1 (0.662 written, 59 of 62 grid checks), which is too early to say anything.

## Lessons

1. **Fix the scoreboard before tuning anything.** For days the main number could not move: noise larger than any effect, a third of the pages unlearnable, no training-set eval. After the re-split and page-by-page comparisons, every later decision was readable.
2. **Format changes move which pages are right, not how many.** Five formats, one ceiling. Plan-only matched them all.
3. **Data was the first real lever; loss placement was the second.** Same recipe, more pages: +18 to +22 on identical pages. Then weighting the 12% of tokens that are the decision went with the jump to 0.844.
4. **The eyes saw more than the words used, but better eyes alone did not fix the plan.** The pointing loss made localisation 97% right and left the plan level.
5. **A readout needs a notion of "one object".** The first Jev version's yeses were mostly right about the object and wrong about the count, because one object offered three candidates.
6. **Check a diagnosis against the distribution before building the fix.** The coordinate-shortcut story was plausible and had code behind it. One histogram ruled it out.
7. **A cleaner readout does not add knowledge.** The checks inherit the written plan's beliefs, 398 of 399 and 14 of 19. They fix readout errors, not perception errors.
8. **What helps one page type can hurt another.** The count question helps canvas and hurts grids. Per-type recipes beat one global rule.
9. **Bundled changes give results, not explanations.** g2 worked, and I still cannot say why.
10. **A tie is a tie.** 336, 335 and 333 of 397 are the same model quality.

## What is next

- **Use each readout where it wins.** Checks for grids, the written plan for canvas and boxes, and both for drags, since they fail on different pages (61-64 of 110 right in either).
- **Land drags more precisely.** Refine around the drop peak at a finer scale than one patch.
- **A pick-one question.** One softmax across all candidates, as Kev does for choice questions, for pages with exactly one answer.
- **A routing question,** so the model says which recipe a page needs instead of me deciding.
- **Unseen families.** 3-9 of 18 at best, across every run. This is the open problem, and none of the above targets it directly.
- **Seeds.** Run-to-run variance is estimated by bootstrap, not measured with repeated seeds. Repeated seeds would turn the estimate into a measurement.

## Mistakes worth admitting

- **The wrong diagnosis above.** The fix for the wrong cause was already built and queued when the histogram showed the real one.
- **Calling a deficit real.** g4b's written plan trailed g3 at epochs 1-2. I said it looked like interference from the checks. By epoch 3 the gap was gone (205 against 206 on the same pages).
- **A stale code copy.** One run trained the wrong format with a too-short token cap, truncating about 30% of first steps. The review caught it.
- **Understated noise.** I first quoted ±4 points. It is ±6-8.
- **A false gain.** I claimed a drag improvement from 34% to 48% that compared different pages.
- **A misdescribed family.** I called one held-out family unseen. It was the same hexagon puzzle as training pages.
- **An unwatched run.** RL run 3 spent eight rollouts on NaN weights because its only watchdog had exited.

## References

- Kev, an open re-implementation of the Jev decision model: [github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev). TypeSafe's Jev and its System One API are described in TypeSafe's documentation; the outside reconstruction Kev is built on is Archer Hume's "Jev's Architecture Unmasked".
- Qwen3-VL-4B-Instruct: [huggingface.co/Qwen/Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct).
- Hu et al., 2021. LoRA: Low-Rank Adaptation of Large Language Models. [arXiv:2106.09685](https://arxiv.org/abs/2106.09685).
- Shao et al., 2024. DeepSeekMath (GRPO). [arXiv:2402.03300](https://arxiv.org/abs/2402.03300).
- Oquab et al., 2023. DINOv2. [arXiv:2304.07193](https://arxiv.org/abs/2304.07193).

_Figures: PNG at 2× and SVG. All numbers are pages right out of pages scored, from held-out pages no run trained on._
