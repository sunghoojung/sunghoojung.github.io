---
title: Training a system one model to solve captchas
date: 2026-11-19
draft: false
thumbnail: thumbnail.png
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
6. [Is reading it out as accurate?](#is-reading-it-out-as-accurate)
7. [Conclusion](#conclusion)
8. [References](#references)

> Disclaimer: I am not selling a service or any of the model or any model weights from this blog. This was purely for educational and research purposes.

## Why captchas

CAPTCHAs have always intrigued me, especially since I was in the sneaker Twitter space, where they thwarted people's chances of quickly buying highly popular sneakers or whatever the hot commodity was at the time. Back in 2019, the usual way to solve them was to use a convolutional neural network (CNN) trained on a large dataset of labeled images. However, these were not the best long-term solution, as new challenges prevented the CNN from generalizing well to solve them. Every new format meant a new dataset and a retraining because the CNNs did not generalize to puzzles they had not seen. For my deep learning final project, I returned to the same problem with better tools to see whether a vision-language model could learn these puzzles from a small amount of data and generalize to new ones.

I picked hCaptcha because it keeps rolling out new kinds of puzzles that take a small amount of reasoning. CAPTCHAs also check things like mouse movement, IP address, and browser details. This project ignores all of that and only tries to answer the puzzle correctly. Each puzzle is a small image with a one-line instruction, and they come in four kinds:

- Picture grids: a 3×3 grid of photos, such as "Pick all objects that melt at room temperature."
- Canvas clicks: a 500×550 scene with many small objects, such as "Find drinks that can be hot or cold."
- Drags: move a piece to where it fits, such as "Drag the letter to the place where it fits."
- Boxes: "Please draw a box around the object that is different."

![Example of a drag challenge](pasted-20261119182822.png)

## Setup

### Terms, model and data

A few terms first. A page is one screen of a challenge, and each action on it is a step. A family is a question type, such as "drinks that can be hot or cold". Held-out pages are never trained on. A new-family page comes from a type with no training examples at all, and a seen-family page is a new puzzle of a type the model did train on.

The model I used is Qwen3-VL-4B-Instruct, a 4-billion-parameter vision-language model. I ran it in bf16 (16-bit) precision and fine-tuned it with LoRA adapters, which are small trainable add-on weights that leave the base model frozen.

For data, I built a recorder that logs every click, drag and box a person makes, lined up frame by frame with what was on screen. Each solved challenge is one episode. I started with about a thousand and ended with 1,368.

### What the model writes

For most of the project the model wrote three short lines and then its action. I call this the written plan:

```
Selected: [...]     what is already done
Remaining: [...]    every action still to take, in panel pixels
Target: {...}       the next action
```

The training targets for these lines come straight from the person's recorded actions, so they are right by construction. The first reinforcement learning runs used free-form reasoning instead, and by the end the model writes nothing at all (see [The Jev idea](#the-jev-idea)).

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

The `<answer>` line repeats Target, so I've left it off steps 2 to 4. Step 1 is the one that gets scored (below), because its Remaining list is the whole plan for the page. From step 2 on, the prompt also carries the first step's plan, restated a few pixels off the person's clicks (up to 25 px), and Remaining is copied from it. When the plan repeated the history's exact numbers, the model learned to cross off only exact matches. At test time the plan is its own and a few pixels off, so nothing matched, and it submitted early on most later steps. The offset makes it match what is already done by place instead of by equal numbers.

### How it's scored

I used two scores. Step accuracy, which only appears in the reinforcement learning section, asks whether one next action is a valid move given what has already been done on the page. Everything after that uses a stricter score, first-step plan right: on a page's first step, the Remaining list has to match the person's actions exactly, in any order. A click counts within 30 px, and a grid click counts on the right tile. A drag counts when the grab is within 30 px and the piece lands within 20 px of where the person's landed. A box counts when it overlaps the person's box by at least half (IoU ≥ 0.5).

The scores are noisy. Scoring the same model twice changed 98 of 225 written outputs, because vLLM's 16-bit arithmetic rounds differently depending on how requests are batched. Only 3 went from right to wrong, but that alone moves a score by 1 to 2 points. Which puzzles land in the test set matters more: a paired bootstrap put the chance gap between two runs at 6 to 8 points on the original 151- and 207-page test sets, and stable runs moved by up to 9 pages between epochs. So I only trust a gain that's bigger than that or holds across several epochs.

## What plateaued

### GRPO first

I started with reinforcement learning because of DeepSeek-R1-Zero, which applied GRPO (Group Relative Policy Optimization) straight to a base model and watched reasoning emerge on its own. Its AIME 2024 score went from 15.6% to 71%. I thought this would be an interesting experiment if a model could emerge that reasons as well in order to go about solving these challenges. I underestimated the cost and the chaos. On one 4060 Ti GPU, a single schedule took about 96 hours, and runs broke in strange ways. Reasoning decayed into word salad, answers looped on one sentence, weights turned into NaN, and Chinese words crept into English answers- the same "language mixing" the R1 paper reports.

The bigger problem was where I started from. GRPO has the model try the same question several times and pushes it toward the tries that scored better, so it can only reinforce something the model already does some of the time. R1-Zero started from a huge model that already knew math. Mine knew almost nothing about these puzzles. On drags, all 16 tries failed in every early group, leaving nothing to learn from. In run 5, 40 minutes of plain supervised training on 474 steps took step accuracy from 0.31 to 0.71. GRPO then added only 0.04 before drifting, and a later supervised-only run matched it without any reinforcement learning. Later, starting GRPO from my best supervised model (g2, below) hit the same wall from the other side. Its whole-plan score was 0.849 before and after 48 updates, because by then the model got most pages right in all 16 tries, and again, there was nothing to compare it to.

Looking back, this is the order the field uses. Even DeepSeek's released R1 was fine-tuned on curated examples before reinforcement learning, partly to fix R1-Zero's language mixing. Reinforcement learning helps once a model succeeds often enough to learn from, but still fails some of the time. Until then, more demonstrations helped me more than any reward did.

![Run 5 and the GRPO learning signal](fig-grpo.png "Figure 1. (a) Run 5 on held-out new question families: 40 minutes of supervised training takes the untrained model from 0.31 to 0.71; GRPO peaks at 0.745, level with a supervised-only run, then drifts until its guard stops it. (b) Share of GRPO groups whose 16 tries got different rewards, the only groups GRPO can learn from. It shrinks as the model improves, and starting from the best supervised model it stays at 11 to 39%.")

### Five reasoning formats

With reinforcement learning set aside, I went back to supervised training and asked a simpler question: does it matter what the model writes before its plan? From here on, every number is the stricter score, the whole plan right on a page's first step. I tried five formats:

| Format | What the first step writes                        | Best score, new / seen families |
| ------ | ------------------------------------------------- | ------------------------------- |
| v5     | a scene sentence, then the plan                   | 0.44 / 0.69                     |
| v6b    | an object list and a rule, plus two other changes | 0.40 / 0.68                     |
| v7     | `[x,y] name -> yes/no` for every object           | 0.36 / 0.68                     |
| v8     | all objects, then a rule sentence, then verdicts  | 0.43 / 0.69                     |
| v9     | v8 with one `[x,y] -> verdict` line per object    | 0.43 / 0.62                     |

![Five reasoning formats on the old split, peaking at 65 to 67 of 151 new-family pages](fig1-format-plateau.png "Figure 2. Five written-reasoning formats on the old split, whole first-step plan right per epoch. (a) New question families, 151 pages. (b) Seen families, 207 pages. The best formats peak at 65 to 67 of 151 new-family pages, a tie within noise. Some training runs ended early due to no faith they will work out with the limited GPU time I had.")

Switching formats changed which pages were right but left the count about the same. The misses show why. Of v8's 86 misses on new families, 51 were letter drags and hexagon shapes, two families with zero training pages, and no way of writing can teach a puzzle the model has never seen. Those families needed data.

A token count showed why more writing didn't help either. One v8 epoch had 304,523 supervised tokens. 42% described the scene and 46% were bookkeeping copied from earlier lines, which reached near-zero loss after one epoch. Only 12% were the decision itself, so most of the training signal went into memorizing object names and positions.

That left a question: was the model failing to _see_ these puzzles, or seeing them and not using what it saw?

### What the vision tower sees

I spent a day on that question. The vision tower is the part of the model that turns the image into features before the language model reads them.

First, when I asked directly, it could see. I took the best checkpoint from the format runs and asked it plain questions outside its trained format, such as "Point to the loose letter." On new-family letter-drag pages it found the letter 37 times out of 39. Inside its trained reasoning, on the same pages, it found it only 22 times. In the 17 misses it often described a scene that wasn't there ("a purple Y on the left") and then acted on what it had made up. The image features were right, and the text drifted away from them. The other half of a drag, where the letter goes, stayed bad however I asked, at 5 or 6 of 39. That spot is a faint outline, which is harder to see hinting to me I had to train the visual side of the model.

Second, its own vision tower beat 21 other image encoders. Many of the puzzles are decided by how things look rather than what they are, and they come in three kinds: drag a piece to where it fits, click the object that doesn't belong, and click every shape that matches. Each kind comes down to a comparison, so I wrote fixed rules for them, seven in all. The drop spot is the patch most like the piece, the odd object is the one least like the rest, and another matching shape is the spot most like one already clicked. An encoder only turns a picture into features, a list of numbers for each patch, and "most like" means the highest cosine similarity between those numbers, with no training and the same rules for every encoder. A drag or matching guess counts if it lands within 40 to 45 px of the person's drop or another shape they clicked, and an odd-one-out guess counts only if it picks exactly the objects the person picked. I ran this on 22 encoders at three depths, so the only thing that differed was the features. Puzzles that need meaning, like drinks that can be hot or cold, can't be tested this way, so they're left out.

![Mean hit rate of 22 vision encoders on seven untrained matching rules](fig-encoders.png "Figure 3. Patch features from 22 vision encoders, scored with seven fixed matching rules and no training (best of raw and blurred per rule, best depth per encoder). Qwen's own tower at three-quarter depth leads at 0.51. Its last layer, the one nearest the language model, falls to 0.26.")

Qwen's tower at three-quarter depth averaged 0.51, ahead of DINOv2-giant at 0.44. Depth mattered more than the choice of encoder. Of the 22 encoders, 18 did best before their last layer, and Qwen's own last layer scored only 0.26. On "the tile that breaks the pattern", the score fell from 0.62 at three-quarter depth to 0.04 at the last layer. A plain cosine-similarity rule with no training found the odd object 93% of the time, on pages where the full model, asked in words, often got it wrong.

Third, blur helped one family. Letter-drag panels are covered in stripes that hide the faint outline of the letter's slot, and a 5 px Gaussian blur wipes the stripes out.

![A letter-drag page as served and after a 5 px Gaussian blur](fig-blur.png "Figure 4. A letter-drag page. (a) As served: the piece (blue) belongs on the faint D under the stripes (red, dashed). (b) After a 5 px Gaussian blur, the stripes are gone.")

With blur, the tower's last layer went from 0.00 to 0.44 on the faint letters, and the full model's "where it fits" went from 5 to 9 of 39. It hurt elsewhere, though. Blur also wipes out the edges of holes, and hole puzzles fell from 14 to 8 of 22.

One caveat came out of the review described in the next section. Qwen3-VL already feeds three intermediate vision layers into the language model, so "the last layer loses it" is too simple. The safer claim is that the vision features contain most of the information, faint outlines aside, and the language side doesn't make full use of it.

## What moved the needle

### Fixing the scoreboard first

After the formats plateaued, I had a separate AI agent review my method. I gave it read-only access and none of my conclusions, and it found a problem. A third of the "new family" test pages came from two families with no training pages at all, so no change could ever help them.

So I re-split the data by challenge, 75/25 within every family. Test pages became new puzzles from families the model had trained on, which means the new numbers compare with the old seen-family score (about 0.69), not the new-family 0.43. I also scored a fixed sample of 100 training pages every epoch and switched to plan-only output: just the three lines and the action, with no written reasoning. Plan-only scored the same as the written formats, so the reasoning text wasn't adding anything.

After that, three changes moved the held-out score, in this order.

![The same 310 held-out pages with old and new data, and all 397 held-out pages for g1, g2 and g3](fig-needle.png "Figure 5. (a) The same 310 held-out pages and the same plan-only recipe, trained on the old data and on more data. (b) All 397 held-out pages for g1 (more data), g2 (adds a decision-weighted loss, vision LoRA, a cosine schedule and shift/scale augmentation) and g3 (g2 plus a pointing head).")

### More data

By now I had 1,082 training pages and 397 held-out pages. Every challenge held out before stayed held out, so old and new runs can be compared on the same pages. The first run, g1, used the same recipe on the bigger data. On the 310 test pages both runs shared, it got 18 to 21 more pages right than the old data at every epoch from 2 to 5, and the best scores were 223 against 211 for the old data with weight decay. Families that had few training pages before now had more, and they started to work. On the 32 hexagon pages both data sets held out, the best old-data run got 15 right. g1, with 56 training pages instead of 12, got 27. g1 was unstable, though. Its hexagon score on all 48 pages went 5, 19, 31, 35, 25, 20, 38, 13 across epochs, and the overall score swung from 0.72 to 0.60 and back. A constant learning rate was too jumpy for this data.

### Four changes at once

g2's loss counted the decision (the Remaining list) four times as much as the bookkeeping copied from earlier lines, and coordinates got soft targets, so a guess 1 pixel off cost less than one 100 pixels off. The vision tower was trained too, with its own LoRA at a learning rate of 1e-4. The learning rate followed a cosine schedule down to zero instead of staying constant. And half the training images were resized and moved, with their coordinates adjusted to match, so the model couldn't memorize where things sit.

g2 climbed steadily to 0.844 (335 of 397), the best written-plan score up to then, and letter drags went from 12 to 17 of 29. Because all four changes landed together, I can't say which one did it confidently.

### A pointing head

g3 added one small piece during training: a pointing head. Halfway up the language model (layer 18 of 36), it scores every image patch against the end of the prompt and learns to put the top score on the patches the person clicked. In g3 the head isn't used for answers, and the model still writes its plan. The head is there for its loss, which tells the vision side directly where things are, instead of only through the written coordinates. (In my model, below, the same head is how it answers "where".) g3 reached 0.839 by epoch 4, where g2 needed until epoch 7 for 0.844, so it tied three epochs sooner. On held-out pages the head found a target within one patch 97 to 98% of the time, yet the whole plan was right on only about 84% of pages, so the model often knew where things were without writing the right plan. Most of the misses left were about which targets to pick and how many. g2 and g3 also failed on different pages: each got about 30 the other missed, and 364 of 397 (92%) were right in at least one.

## The Jev idea

### The written plan was too slow

The first time I let the model play a real widget, I mostly sat there waiting. It got the screenshot, and then for five, ten, sometimes thirty seconds nothing happened while it typed out its plan one token at a time: the Selected line, the Remaining line, every coordinate digit by digit. Over the live challenges I timed, the written plan took a median of 12.4 seconds of model time per challenge, and the slowest took more than a minute. A person clears the same page in two or three seconds.

Looking at the picture was quick. By the time the model started writing, it had already seen the page and, in a sense, already made up its mind, so nearly all of the wait was the model spelling that decision out as text and with my limited compute it was taking quite a while.

I was complaining about this to a friend, and they told me to look at system one decision models like Jev. The term comes from Kahneman's two kinds of thinking. System two is slow and deliberate, and system one is the quick gut answer you give without talking yourself through it. My written plan was pure system two, narrating every page before touching it, and a captcha needs system one: look once and answer.

### How Jev works

Jev is TypeSafe's hosted decision model. You send it a piece of text and a few short questions, and it answers every question with a calibrated probability and no generated text. Jev itself is only available as a service, so I worked from Kev, Jared Palmer's open re-implementation ([github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev)), which is built from Archer Hume's outside reconstruction of Jev. A Kev checkpoint is a Qwen base model, a LoRA adapter and a small pointer head.

Kev puts the shared text and every question into one token sequence:

```text
<state> …state…
<q> instructions <opt> option 1 </opt> <opt> option 2 </opt> … <decide>
<q> instructions <opt> option 1 </opt> <opt> option 2 </opt> … <decide>
```

The attention mask lets each question's tokens read the shared text and their own question, but not the other questions. The text is processed once and cached, and adding a question never changes another question's answer.

Every question is a list of options, yes/no included. A yes/no question is two options, false and true. A pick-one question can have up to 255, and a rating question has one option per level. The pointer head chooses among them, and it works like a single attention head. The question's last token, `<decide>`, comes after all the options and can read them, so its hidden state is the query. Each option's closing `</opt>` hidden state is a key. Both are projected down to 256 numbers, every option gets the score `q · k / √256`, and a softmax over the options turns the scores into probabilities. A yes/no answer is p(true). Each checkpoint also stores a temperature that divides the scores, which calibrates the probabilities without changing which option wins. Training is plain cross-entropy on the right option, with the adapter and the head trained together.

### The same idea on a puzzle page

I built my own version for puzzle pages. The panel's image tokens and the instruction are read once and cached. Everything the model has to decide, such as which action, how many and where, becomes a short question that branches off that one reading.

![How my model answers a page: one pass reads it, short questions branch off the cache](fig-tev-diagram.png "Figure 6. How my model answers a page. One pass reads the screenshot and caches it. Each short question branches off that cache: the words (which action, how many, yes or no) come from next-word probabilities, and the places come from the pointer head. A small planner turns the readouts into mouse actions, and no text is generated. This is the version I ran live at the end; the Action question and the box corners came after the first versions in the next section.")

I changed two things from Kev. For "where" questions, the options are the 440 image patches of the screenshot instead of option tokens, so the same kind of pointer head picks a patch instead of a phrase. And the word answers don't go through the pointer head at all. "Action:", "How many:" and the yes/no checks read the language model's own next-word probabilities (over click, drag and box, over the digits 0 to 9, and " yes" against " no"), each renormalized over its options. I also kept training the written plan in the same run, so I can compare every readout with it on the same pages.

### Pointing with a query and a key

Words are easy to read out this way, because a language model already has a probability for every possible next word. Places are harder. Writing "x=412, y=230" out as text was the slow part I wanted to get rid of, so places go through the pointer head.

The pointer head borrows how attention works. Inside a transformer, every token makes a query vector and a key vector, and the dot product of one token's query with another token's key decides how much the first looks at the second. A dot product is biggest when two vectors point the same way, so whichever key is closest to the query wins. Kev uses this to pick an option, and my model uses it to pick a spot on the page.

The pointing head from g3 has the same shape as Kev's, with the image patches as the options. Its query `q` is the hidden state of the question's last token, say the token for "Top-left:", at layer 18. Its keys `k_i` are the hidden states of the 440 image patches at the same layer, each covering about 25 px of the panel. Both are normalized and squeezed down to 256 numbers by a small learned matrix, and every patch gets a score:

```text
score_i = (W_q · q) · (W_k · k_i) / √256
```

A softmax over the 440 scores turns them into a heat map over the page. A normal attention head would use those weights to blend information from the patches. Here, as in Kev, the weights are the answer, showing where the model looks when you ask it for "Top-left", and the hottest patch is the point.

Training it was almost boring. For every human demonstration the target is a small soft blob, about one patch wide, centered on the point the person actually used, and the loss is the cross-entropy between that blob and the heat map. The head starts out nearly flat (its query weights begin 100 times smaller than its keys), so bolting it on changes nothing until it has learned something.

![A live box drawn from two pointer questions](fig-pointer.png 'Figure 7. A box drawn live from two pointer questions, on "Please draw a box around the animal that hatches from an egg." (a) "Top-left:" puts 0.13 of all its weight on a single patch, and (b) "Bottom-right:" puts 0.16 on one. Spread evenly, each patch would get 0.002. (c) The box between the two peaks, around the lizard. The widget passed it.')

### Yes/no checks

A click puzzle can need one click or five, and a heat map's hottest spot gives only one. So the model first lists candidate spots, then asks a yes/no question about each: "Check [x,y] ->", answered by the probability of " yes" against " no". On a picture grid the candidates are the nine tile centers. On a canvas they're the 16 hottest spots in the pointer head's heat map, picked at least 45 px apart and then each moved to the middle of its hot area, which can pull neighbors closer together. Each check is its own branch off the cached reading, as in Kev: it sees the page but none of the other checks, so one check's answer can't sway another.

None of this needed new labels, because the person's recorded actions already answer every question. A candidate near one of their clicks is a yes and the rest are no, the number of clicks answers "How many", and where they grabbed and dropped a piece answers the drag questions.

On one live canvas page (Figure 8), drawn to look like a grid, eight of the sixteen candidates landed on the globe and came back yes at about 1.0, and the other eight came back at 0.01 or less. Eight yeses on one object is a problem I walked straight into with the first version (see "Is reading it out as accurate?"), which is why a canvas page doesn't click every yes. It asks "How many:" and clicks that many of the best spots, skipping any within 75 px of a better one. The count said 1, so it played one click. Had it said 3, it would have clicked the three highest-scoring spots at least 75 px apart. A picture grid skips the count and clicks every tile whose p(yes) is at least 0.5.

![One live click decision: 16 candidate spots, 8 yes, all on the globe](fig-readout.png 'Figure 8. One live click decision, "Identify the item that spins in a circle." (a) The 16 candidate spots. The 8 that said yes all sit on the globe, and one click was played. (b) p(yes) for each spot, sorted. Action said click with p = 1.00 and How many said 1. No text was generated.')

### Drags

A drag needs two places, the piece and where it goes, so my model asks two pointer questions, "Piece:" and "Drop:". Like the box corners in Figure 7, each one is answered by a heat map from the pointer head, and its hottest patch is the point. Training pushes the "Piece:" map toward where the person grabbed the piece and the "Drop:" map toward where they let go.

One peak from each isn't enough. Some pages ask for two drags ("Drag the TWO shapes to their matching outlines"), and the strongest peak isn't always the right one. So the final version handles drags the way it handles clicks. The two heat maps propose up to 6 pieces and 8 places, and every piece-and-place pair gets its own yes/no question, "Move [x1,y1] to [x2,y2] ->". A pair is labeled yes when it would pass the same test the score uses: a grab within 30 px of the person's, and the piece landing within 20 px of where theirs landed. Pairs that come close without passing are left out of training. The no examples favor the hard cases: the right piece in the wrong place, or the wrong piece aimed at the right place. At decision time, "How many:" says how many drags the page needs, and the model plays that many of the highest-scoring pairs, using each piece and each place only once.

### Was it actually faster?

Yes, by a lot. To make the comparison fair, I ran both models on the same 29 recorded steps, on the same base model (Qwen3-VL-4B) and the same GPU. My model took 0.72 seconds per decision on average. The written plan took 4.85 seconds, so my model is about 6.7 times faster.

![My model and the written plan, seconds per decision](pasted-20261124044542.png "Figure 9. Time per decision on the same 29 recorded first steps, same base model and GPU. Text-free is my model and Reasoning is the written plan. My model is about 6.7 times faster overall and faster on every kind of challenge.")

The gap holds for every kind of challenge. It is widest on box challenges (0.57 s against 4.95 s, 8.7×) and narrowest on drags (1.2 s against 5.6 s, 4.7×). Drags are my model's slowest kind of challenge, and it is still almost five times faster there.

Speed was the reason I started, but I still had to find out whether reading answers out is as accurate as writing them. The next section is me finding that out the hard way.

## Is reading it out as accurate?

Nearly. The final recipe, g8, trained for eight epochs, and after each one I scored both ways of answering on the same 395 held-out first steps (the earlier 397, minus two where the person only pressed submit): the readouts, with no text, and the written plan from the same weights.

![Figure 10. The final recipe (g8), epoch by epoch. (a) Training loss of three readout questions on training pages: the yes/no checks, the drag pairs and "How many:" for clicks. (b) Held-out first steps right, out of 395, for the readouts and for the written plan from the same weights. Both peak at epoch 7. (c) Epoch 7 by kind of page, as the share of pages right, with the counts on the bars.](pasted-20261124045234.png)

Training loss kept falling through all eight epochs, but held-out pages leveled off after about epoch 5, so the later epochs mostly memorized the training pages. At the best epoch, 7, the readouts got 319 pages right and the written plan 337. The readouts trailed at every epoch from 2 on, so the gap is real, but it's small and uneven. Boxes and grids are level, at 43 against 44 and 59 against 57. Canvas clicks trail by 8 pages and drags by 11, so drags are most of the difference. That's the price of deciding about seven times faster.

Getting there took one fix. The first version, g4, clicked too many: on 114 of 180 canvas pages it played extra clicks. The extra yeses weren't random. 898 of the 988 wrongly passed candidates sat within 60 px of a real target, on the edge of the right object, so one object became two or three clicks. Spacing the candidates further apart, leaving those near misses out of training and merging yeses within 75 px cut the pages with too many clicks from 114 to 5. "How many:" came after that.

The readouts and the plan also believe the same things. Given the written plan's own points as candidates, the checks passed 398 of its 399 correct points and 14 of its 19 wrong ones. When the plan is wrong, the checks usually agree with it, so most of the misses the two share come from what the model sees, not from how the answer is read out.

## Conclusion

For those curious to see how the model works and whether it can pass real hCaptcha challenges, look at my demo video on [X](https://x.com/sunny17347/status/2123201179224285296?a=uIyabZZl5ZeKyIY86U0&s=20)!

The model does show hints of generalization by completing tasks that weren't in the model's training set showing that it can adapt to newer challenges presented by hCaptcha. However, it still does falter a lot so in the future trying a better RL training method done in a better way compared to my failed GRPO experiment seems like a nice future experiment. However thank you for reading this article I have some more fun projects and more ideas I will be sharing in the future! Stay tuned.

## References

- Kev, an open re-implementation of the Jev decision model: [github.com/jaredpalmer/kev](https://github.com/jaredpalmer/kev). TypeSafe's Jev and its System One API are described in TypeSafe's documentation; the outside reconstruction Kev is built on is Archer Hume's ["Jev's Architecture Unmasked"](https://archerhume.com/posts/jevs-architecture-unmasked).
- Qwen3-VL-4B-Instruct: [huggingface.co/Qwen/Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct).
- Hu et al., 2021. LoRA: Low-Rank Adaptation of Large Language Models. [arXiv:2106.09685](https://arxiv.org/abs/2106.09685).
- Shao et al., 2024. DeepSeekMath (GRPO). [arXiv:2402.03300](https://arxiv.org/abs/2402.03300).
- DeepSeek-AI, 2025. DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning. [arXiv:2501.12948](https://arxiv.org/abs/2501.12948).
- Oquab et al., 2023. DINOv2. [arXiv:2304.07193](https://arxiv.org/abs/2304.07193).
- Kahneman, 2011. _Thinking, Fast and Slow_.

_Unless it says otherwise, every score is pages right out of pages scored, on held-out pages no run trained on._
