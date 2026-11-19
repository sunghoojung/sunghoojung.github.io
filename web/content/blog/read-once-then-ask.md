---
title: "Read once, then ask: yes/no readouts for a small vision-language model"
date: 2026-11-17
draft: true
thumbnail: fig1-format-plateau.png
description: "An experiment log from fine-tuning Qwen3-VL-4B on image puzzles from human demonstrations: what plateaued, what moved the held-out score, and what happened when the written plan was replaced by Jev-style yes/no questions read from the model's hidden states."
tags:
  - machine-learning
  - vision-language-models
  - fine-tuning
  - lora
  - experiment-log
---

> **Draft, 17 November 2026.** Three runs are still training (g4c, g4e, g4f). Their numbers below are partial and marked as such.

I fine-tuned a 4-billion-parameter vision-language model to solve image puzzles from human demonstrations. For a week the held-out score would not move. Then three things moved it: more data, a loss aimed at the decision, and a pointing loss for the vision tower. After that it stopped again, at about 0.84.

The last part of this post is about a different way to read the answer out. Instead of having the model write a plan and parsing it, I ask it short yes/no questions on top of one shared reading of the page and read the answer from its own token probabilities. The idea comes from TypeSafe's Jev decision model and its open re-implementation, Kev.

It works on picture grids. On free-form canvases it does not beat the written plan, and a direct test says why: the yes/no answers share the written plan's beliefs, so the remaining errors are about what the model sees, not how its answer is read.

## TL;DR

- **Task.** Qwen3-VL-4B with LoRA, trained on 1,082 pages of recorded human demonstrations. Scored on 397 held-out pages by one strict number: is the whole plan on the page's first step right?
- **What plateaued.** Five written-reasoning formats, GRPO, vision LoRA at a low rate, 4× more image tokens and an 8B model. The three best formats all peaked at exactly 65 of 151 new-family pages.
- **What moved.** More data (+18 to +22 pages on the same 310 held-out pages), then putting the loss on the decision tokens (0.844), then a pointing loss (0.839, a tie that arrived three epochs sooner).
- **Jev-style checks.** One `Check [x,y] ->` branch per candidate point, answered by the model's own `" yes"` / `" no"` probabilities. Grids: 58-60 of 62, level with or above the written plan. Canvas clicks: 151 of 180 at best, against 157-158 for the written plan.
- **The instructive failure.** The first version collapsed on canvas (95 to 52 of 180) because several candidates landed on one object. 898 of 988 wrong yeses sat within 60 px of a real target. My first diagnosis was wrong, and the data said so.
- **The finding.** On the best checkpoint, the checks pass 398 of 399 of the written plan's correct points and 14 of its 19 wrong ones. They inherit its mistakes.
- **In progress.** Drag "where" questions: the grab is within 30 px on 79% of pages, the landing within 20 px on only 40%.

## Contents

1. [Why this problem](#why-this-problem)
2. [Setup and scoreboard](#setup-and-scoreboard)
3. [What plateaued](#what-plateaued)
4. [What moved the needle](#what-moved-the-needle)
5. [The Jev idea](#the-jev-idea)
6. [Jev versions, and how the first one failed](#jev-versions-and-how-the-first-one-failed)
7. [Findings](#findings)
8. [Lessons](#lessons)
9. [What is next](#what-is-next)
10. [Mistakes worth admitting](#mistakes-worth-admitting)

## Why this problem

The puzzles are small images with a one-line instruction. There are four kinds:

- **Picture grids.** A 3×3 grid of photos: "Pick all objects that melt at room temperature."
- **Canvas clicks.** A 500×550 scene with many small objects: "Find drinks that can be hot or cold."
- **Drags.** Move a piece to where it fits: "Drag the letter to the place where it fits."
- **Boxes.** "Please draw a box around the object that is different."

They are a good testbed for vision-language models for three reasons. Every answer is checkable, so there is no judging. The instructions mix perception ("the faint letter") with world knowledge ("melts at room temperature"). And a page often needs several actions, so the model has to commit to a plan.

The data is human demonstrations: someone solves the page and every click, drag and box is recorded. The model learns to imitate them. No labelling beyond that.

The question I kept coming back to is simple. When a small model gets a page wrong, is it because it cannot see the answer, or because it sees it and fails to say it?

## Setup and scoreboard

**Model.** Qwen3-VL-4B-Instruct in bf16. LoRA rank 16, α 32, on the seven language projections (33M parameters). Later runs also put LoRA on the 24 vision blocks and the merger (7.2M more).

**Hardware.** Almost everything ran on one 16 GB RTX 4060 Ti. One epoch takes 60-75 minutes and an 8-epoch run about 12-13 hours. On the last day I added a rented 2× RTX 5080, about 2.3× faster per step, to run two experiments at once.

**Data.** 1,096 recorded episodes gave 4,246 usable steps from 1,048 challenges. The final split has 1,082 training pages, 397 held-out pages, and 18 pages from two question families held out completely.

**Output.** On each step the model writes three short lines and an action:

```text
Selected: [...]     what is already done
Remaining: [...]    every action still to take, in panel pixels
Target: {...}       the next action
```

**Metric.** _First-step plan right_: on a page's first step, the `Remaining` list must match the human's actions exactly, in any order. A click counts within 30 px. A grid click counts on the right tile. A drag counts when the grab is within 30 px and the piece lands within 20 px of where the human's landed. A box counts by overlap. Every number in this post is pages right out of pages scored.

**Noise.** This took me too long to take seriously.

- vLLM's bf16 numerics change with batching. Re-running the same weights greedily changed 98 of 225 answers by a coordinate digit, which is about ±2 points of noise from arithmetic alone.
- A paired bootstrap over challenges put run-to-run differences at about ±6-8 points on the 151-397-page splits.
- Neighbouring epochs of one run move by up to 9 pages, even in the stable runs.

So a one-page gap on 397 is a tie, and I report it as one.

How this was run: AI coding agents wrote much of the code and watched the runs. One format's rule sentences were written by LLM subagents and checked by blind LLM raters. A separate agent, given read-only access and no conclusions, did the review in the next section.

## What plateaued

### GRPO first

I started with reinforcement learning, following DeepSeek-R1-Zero: groups of 16 samples, group-normalised advantages, a clipped ratio and a KL penalty. Six runs taught me a lot about RL hygiene and little about the task.

- Run 3 reached 0.712 action accuracy, then its weights went NaN at update 1,728 when the KL estimator overflowed. The only watchdog had exited long before, so eight rollouts trained on NaN.
- Run 5 added a supervised warm start on 474 written steps. The warm start alone, 40 minutes of training, gave 0.706. GRPO added about 0.04 and then drifted until its guard stopped it.
- A supervised-only sweep later matched it, 0.745, with no RL at all.

Much later I ran GRPO again from the best supervised model. Held-out score was 0.849 at update 0 and 0.849 at update 48. Only 16-39% of groups had any spread in reward, because the model already got most training rows right in all 16 samples. GRPO is parked for later, when new failures can supply the signal.

### Five reasoning formats, one ceiling

![Five reasoning formats on the old split, all reaching 65 of 151 new-family pages](fig1-format-plateau.png)

_Figure 1. Five written-reasoning formats on the old split. (a) New question families, 151 pages. (b) Seen families, 207 pages. v5 at epoch 4, v8 at epoch 3 and v9 at epoch 2 each got exactly 65 of 151 new-family pages right._

I tried five ways of writing the reasoning before the plan:

| Format | What the first step writes                        | Best new / seen |
| ------ | ------------------------------------------------- | --------------- |
| v5     | a scene sentence, then the plan                   | 0.43 / 0.69     |
| v6b    | an object list and a rule, plus two other changes | 0.40 / 0.68     |
| v7     | `[x,y] name -> yes/no` for every object           | 0.36 / 0.68     |
| v8     | all objects, then a rule sentence, then verdicts  | 0.43 / 0.69     |
| v9     | v8 with one `[x,y] -> verdict` line per object    | 0.43 / 0.62     |

The formats changed _which_ pages were right, not _how many_. Of the 86 new-family misses, 51 were letter drags and hexagon shapes, two families with zero training pages. No format can fix that.

A token count explained part of it. In one v8 epoch there were 304,523 supervised tokens. 42% described the scene, 46% were copied bookkeeping that reached near-zero loss after one epoch, and only 12% were the decision. The gradient was mostly memorising object names and positions.

### The eyes see more than the words use

I spent a day on the vision side. Four results:

- **Asking differently helps.** Asked directly to point at the loose letter on new-family drag pages, the model finds it on 37 of 39. Inside its trained reasoning, it grabs it on 22 of 39. It often invents a scene and then acts on the invention.
- **The model's own vision tower is the best of 23 encoders.** I compared patch features with fixed rules and no training: is the drop spot the patch most like the piece; are the odd objects the least like the rest. Qwen's tower at three-quarter depth averaged 0.51, ahead of DINOv2 giant at 0.44. At its last layer it scored 0.26.
- **Blur helps one family.** A 5 px Gaussian blur removes a grid overlay that hides faint letters. On those letters the tower went from 0.00 to 0.44. It makes holes worse.
- **Size and resolution do not.** Four times the image tokens and the 8B model left the hard questions flat.

One caveat came from the review. Qwen3-VL already feeds three intermediate vision layers into the language model, so "the last layer loses it" is too simple. The claim that survives is narrower: the information is in the vision features, and the language readout does not use it.

### Fixing the scoreboard

The independent review was blunt. The scoreboard could not show a win. Noise was about ±7 points, and a third of the new-family pages came from families with no training data. There was no evaluation on training pages, so underfitting and memorising looked the same. Weight decay and LoRA dropout were hard-coded to zero. And the earlier vision-LoRA run, at a learning rate of 2e-5, had moved the vision weights by only 0.37%. Training the eyes had never really been tested.

So I re-split by challenge, 75/25 within every family, kept a fixed 100-page training sample in every evaluation, and trained on _plan-only_ completions with no written notes. Plan-only tied the written formats on shared pages (27 against 25-27 of 44) while being much shorter. From here every number is comparable.

## What moved the needle

### 1. More data

![The same 310 held-out pages scored before and after more data](fig2-same-pages.png)

_Figure 2. The same 310 held-out pages, scored by runs before and after 287 newly recorded challenges. With the same recipe, the new data (g1) beat the old-data control by 18-21 pages at epochs 2-5. The combined recipe (g2) added about 40 more._

I recorded 287 more challenges. The new split kept every old held-out page held out, so old and new runs compare page for page. With the same recipe, g1 beat the old-data control at epochs 2, 3, 4 and 5 by 21, 19, 18 and 18 pages.

It was also unstable. On hexagon pages, g1's last five epochs scored 35, 25, 20, 38 and 13 of 48. The model alternated between listing too few targets and too many. The training sample fell along with the held-out score, so this was not memorising. It was a constant learning rate.

### 2. Put the loss where the decision is

g2 changed four things at once:

1. **Vision LoRA at 1e-4**, five times the earlier rate. This time the vision weights really moved.
2. **A decision-weighted loss.** Each part of the completion is averaged on its own and weighted: the first-step plan ×2, the next action ×1, copies ×0.5, the answer ×0.5.
3. **Soft coordinate digits** on the first step's `Remaining` line. A point a few pixels off is barely punished, and the exact human pixel is no longer worth memorising.
4. **Cosine learning-rate decay** and **shift/scale augmentation**: half the pages shrunk to 80-100% and moved, every coordinate moved with them.

The soft digits are small. Each coordinate digit's target is a Gaussian over the ten digits, wide for units, narrow for tens, and exact for hundreds. This is from the trainer, with the input check removed:

```python
def soft_digit_target(digit, sigma):
    """The soft target over the ten digits for true digit ``digit``: q(k) ∝ exp(-(k - digit)² / 2σ²)."""
    if sigma <= 0:
        return [1.0 if k == digit else 0.0 for k in range(10)]
    weights = [math.exp(-((k - digit) ** 2) / (2 * sigma * sigma)) for k in range(10)]
    total = sum(weights)
    return [weight / total for weight in weights]
```

The segment weighting is a per-part mean (excerpt from `decision_digit_losses`):

```python
for index, name in enumerate(DECISION_SEGMENTS):
    part = (segments == index).to(per_token.dtype) * mask
    total, count = (per_token * part).sum(-1), part.sum(-1)
    losses = losses + weights[name] * total / count.clamp(min=1.0)
```

with `{"decision": 2.0, "next": 1.0, "copy": 0.5, "answer": 0.5}` and σ 2 for units, 0.5 for tens. Copied coordinates stay exact, because grading needs `Target` to equal an entry of `Remaining`.

g2 rose steadily and stayed level: 0.630, 0.718, 0.793, 0.826, 0.834, 0.829, **0.844**, 0.841. The swings were gone. Letter drags went from 1-2 of 9 in the old runs to 17 of 29.

Because the four changes went in together, I do not know which did most. Finding out means dropping one at a time, about 12 hours each.

### 3. A pointing loss for the eyes

The vision tower only learned through the text loss. g3 adds a training-only head. It takes the language model's state at layer 18 for the last prompt token and scores every image token of the panel against it. The target is a soft bump on the patch grid at each human point. The head is two projections and a dot product (from the trainer):

```python
def pointer_scores(head, query, states):
    """score_i = (W_q q) · (W_k k_i) / √dim, in float32, of one prompt's image tokens."""
    query = _rms_normalised(query.float()) @ head["query"].T
    keys = _rms_normalised(states.float()) @ head["key"].T
    return keys @ query / math.sqrt(head["query"].shape[0])
```

The loss is the cross-entropy against the bumps, weighted 0.5. Its gradient reaches language layers 1-18, the merger and the vision tower. At inference nothing changes.

The eyes learned to locate. By epoch 4, 97-98% of held-out targets were within one patch of the head's best guess. The plan did not follow.

![Held-out first-step plan accuracy per epoch for five runs](fig3-heldout-curves.png)

_Figure 3. First-step plan right on the 397 held-out pages. g2, g3 and g4b peak at 335, 333 and 336: a one-to-three page spread. g3 got there faster (0.791 at epoch 2 against 0.718). g4c is at epoch 4 of 8._

g3 peaked at 0.839 at epoch 4, two pages below g2. That is a tie. But the two models fail on different pages: each gets about 30 pages the other misses, and 364 of 397 (0.917) are right in at least one. The remaining errors are mostly _which_ and _how many_ targets to pick. Better eyes did not decide that.

That is the point where a different readout started to look worth trying.

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

|                                | Epoch 1        | Epoch 2        |
| ------------------------------ | -------------- | -------------- |
| Where questions right          | 43 / 110       | 39 / 110       |
| Written plan right, same pages | 45 / 110       | 54 / 110       |
| Either right                   | 64 / 110       | 61 / 110       |
| Grab within 30 px              | 87 / 110 (79%) | 76 / 110 (69%) |
| Landing within 20 px           | 44 / 110 (40%) | 44 / 110 (40%) |
| Median grab / landing error    | 16 / 29 px     | 22 / 24 px     |

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
