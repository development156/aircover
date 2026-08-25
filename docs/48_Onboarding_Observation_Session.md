# 48 · Run the onboarding session — a script for watching one real person

**25 August 2026, research lane. Screens re-checked at `HEAD`.** Step 3 of the `docs/46`
repairs. It is the only step with no engineering in it, and the only one that
tells you whether steps 1 and 2 helped.

This file exists because "sit a user through onboarding and watch" is easy to
agree with and hard to actually do well. What follows is the session: what to
say, what not to say, what each screen really does with the answer, and the
three decisions the session is meant to settle.

---

## Why this outranks more building

Five annotated screenshots from one person found more than the test suite found
in fifty sessions. The Confirm controls were invisible to the founder while
every test asserting them passed, because the tests asserted the button was in
the DOM and the question was whether it looked pressable. No assertion has ever
been written that can fail for that reason.

Steps 1 and 2 are **guesses about what helps**. Step 1 roughly tripled what the
model is told. Step 2 gave two writing tasks the library. Neither has been read
by anyone against a real business. Building step 4 before running this session
is building on two unverified guesses.

---

## Before the room

**One person, not a group.** A second participant turns observation into
discussion and the quiet moments disappear, and the quiet moments are the data.

**Someone who runs a real small business** and is not in software. Not a
teammate, not a friend who will be kind about it.

**Record the screen and the audio**, with permission. You will not catch the
pauses live, and the pauses are where the confusion is.

**Two people from your side at most**: one who talks, one who only writes. If
there is only one of you, do not take notes while they work. Watch, and write
between screens.

### The rules for the observer

1. **Do not help.** Not once. The moment you explain a screen, that screen is
   no longer measurable and neither is the next one.
2. **Do not defend.** "It does actually do that, it's just further down" is a
   sentence that ends the session's usefulness.
3. When they stop, ask one thing and nothing else: **"What are you thinking?"**
4. When they ask you a question, answer with **"What would you expect?"**, then
   silence. The silence is uncomfortable and it is the technique.
5. **Write the timestamp of every pause longer than about three seconds.**
   A pause is the only unfaked signal in the room.

---

## What each screen actually does

Eight screens: an intro, five numbered, the competitor step, and the result.
Read this column before the session so you are never surprised in the room, and
never during it.

**This table is shorter than it was.** The first draft listed nine screens and
flagged two of them as the product lying. Those two were fixed rather than
observed: the References screen is gone, and so are the two uploads that kept no
file. What follows is what a participant will actually meet.

| #   | Screen      | What it asks                                                                                | Where the answer actually goes                                                                            |
| --- | ----------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| —   | Intro       | Nothing. Begin, or review an existing brain                                                   | Shows the price, or "free the first time"                                                                   |
| 1   | Basics      | Brand name, website (optional)                                                                | Name to `source.name`; the URL is fetched and its text becomes the evidence the whole resolve reads         |
| 2   | Positioning | What the brand does; a category chip or a typed trade; anything Sahoda should never say       | The sentence to `source.one_liner`, the trade to the classifier, the never-say to `taboo.avoid_topics`      |
| 3   | Audience    | Ideal customer, plus age, place, role, interests                                              | Joined into `customer.description`                                                                          |
| 4   | Visual      | Colour swatches only                                                                          | The workspace theme: the swatches they moved, or colours pulled off their website if they moved none        |
| 5   | Knowledge   | A website, an Instagram, a product catalogue                                                  | Each address is fetched, stored and indexed into the library. Free: no model is called                      |
| —   | Competitors | Name, kind, public address                                                                    | Sent to Radar's watch list after the brain is built                                                         |
| —   | Result      | Nothing                                                                                       | Says the first brain was free and nothing was charged                                                       |

Every row now reaches something. That was not true when this file was written,
and the two rows that did not are why the flow is one screen shorter.

---

## What to watch, screen by screen

Each row is a thing to look for and the one question to ask **after** they leave
the screen, never during.

**1 · Basics.** Do they paste a website without being asked twice? Do they
hesitate over "optional"? Ask: *what did you think we would do with your
website?*

**2 · Positioning.** Watch the category chips. Do they pick a chip that is
nearly right, or do they reach for "Other" and type? Watch the never-say field —
it is new and nobody has ever used it. Do they leave it empty? Ask: *was there
anything you wanted to say here and could not?*

**3 · Audience.** Four small fields after one big one. Do they fill all of them
or abandon after the first? Ask: *which of those felt like a real question?*

**4 · Visual.** Do they touch the colours at all, or accept what is there?
Untouched swatches are not neutral: the product then themes the workspace from
colours pulled off their website instead. Watch for somebody hunting for a logo
upload, which used to sit here and was removed because it kept only the file
name. Ask: *was anything missing from that screen?*

**5 · Knowledge.** Three tiles, each asking for an address. Do they understand
that a tile is a page and not an account connection? Ask: *did you think you had
connected something?*

**Competitors.** Two of the three fields are required and the kind is a choice
of three. Do they know which kind their rival is? Ask: *would you have added
more if it were quicker?*

**Result.** The moment that matters most. Watch their face while it renders. Do
they read the brain, or do they scroll past it to find the next button? Ask:
*is any of that wrong?* — and then say nothing for a long time.

**Then send them to `/brain` and stop talking.** This is the real test of last
week's work. Fifteen fields, each marked Guess, each with a Confirm beside it
and a Confirm all at the top of the section. **Do they press anything?** The
founder could not see those buttons when they were ghost-styled. They are
`secondary` now. This session is the only way to find out whether that was
enough.

---

## The three decisions this session settles

These are the reason to run it, and each one is currently blocked on not
knowing.

1. **Is the resolved brain worth confirming?** If they read fifteen guesses and
   press nothing, the confirmation model is wrong and no amount of better
   retrieval fixes it. Everything in step 4 assumes people confirm.
2. **What do they think the library is for?** Step 2 now feeds their documents
   into captions. Whether that is the right thing to retrieve depends entirely
   on what they thought they were uploading. Watch which of the three tiles they
   reach for first.
3. **What would they want the product to have learned by month three?** Ask it
   at the end, in those words. `docs/46` closes on this: the hidden learned layer
   has no schema, no table and no writer, because nobody knows what it should
   hold. This is the question that answers it, and it cannot be answered from
   inside the codebase.

---

## Afterwards, the same day

Write three things while it is fresh. Not a report.

- **Every pause, with its timestamp and the screen.** The list of pauses is the
  finding. Everything else is interpretation.
- **Every sentence they said that contradicts something the product claims.**
  Verbatim, not paraphrased.
- **The single worst moment**, and whether it was confusion, boredom or
  distrust. Those three have different fixes and are easy to blur together
  afterwards.

Then decide step 4 from what you saw, not from the ranking in `docs/46`. That
ranking was written from a source trace with nobody in it.

---

## What this file cannot do

It cannot tell you the session went well. One person is one person, and the
first session mostly teaches you how to run the second. It also cannot see
anything about a returning user: every screen above is a first run, and the
accumulation the moat depends on happens on visit forty, which no session of
this shape will ever show you.
