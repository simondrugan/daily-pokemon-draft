# How work gets done

## The board

Tickets are GitHub Issues, shown on a GitHub Projects board. Labels carry the state, because
labels are what the agents can read and write.

| Column | Label | Meaning |
|---|---|---|
| Backlog | none | An idea. Nobody works on it yet |
| Ready | `ready` | You have decided this should be built |
| In progress | `in-progress` | A run has picked it up |
| Needs info | `needs-info` | The agents have a question for you. Answer in a comment, then remove the label |
| In review | open pull request | Waiting for you to review and merge |
| Done | closed | Merged and live |

Other labels:

- `priority` — work this before other ready tickets.
- `engine`, `ui`, `content` — which areas a ticket touches. The project manager adds these.
- `bug` — something broken. Bugs labelled `ready` go before features.

To ask for something: open an issue with the Ticket or Bug template, then add `ready` when you
want it built. If one ticket must wait for another, write `Blocked by #12` in it.

## The roles

| Role | Does | Does not |
|---|---|---|
| `project-manager` | Chooses the ticket, checks it is buildable, writes the plan, signs off the result | Write code |
| `engine-dev` | Battle rules, champion AI, draft logic, config validation | Touch the interface |
| `ui-dev` | Screens, layout, styling | Change battle rules |
| `content-designer` | Data files and balance | Change code |
| `reviewer` | Checks the finished branch for bugs and rule-breaking | Edit files |

The session that runs is the **lead**. It does not decide what to build; it asks the project
manager, carries out the plan by calling the other roles in the order given, and passes each
role's handoff notes to the next. (Agents cannot start other agents themselves, so the project
manager directs the work through its plan and the lead does the calling.)

## Choosing what to work on

One thing per run, the first of these that applies:

1. **Review feedback.** An open pull request from a `ticket/` branch where the owner has left
   comments or requested changes that have not been answered. Finishing work beats starting work.
2. **A stalled ticket.** An issue labelled `in-progress` with no open pull request. If its branch
   exists, continue from it; if not, start it again.
3. **Too much waiting.** If three or more pull requests are already waiting for the owner, start
   nothing new. Stop and say so.
4. **A ready ticket.** Open issues labelled `ready` without `in-progress` or `needs-info`, not
   blocked by an unmerged ticket: `bug` first, then `priority`, then oldest.
5. **Nothing.** Stop without changing anything.

## Run procedure

1. **Plan.** Call `project-manager` in plan mode. If it says nothing to do, stop.
2. **Unclear, too big or not allowed.** Post the project manager's question or proposed split as
   a comment on the issue, replace `ready`/`in-progress` with `needs-info`, and stop. Do not guess.
3. **Claim.** Add `in-progress` and the area labels. Post the plan as a comment on the issue, so
   the owner can see what is about to be built and why.
4. **Branch.** `ticket/<number>-<short-name>` from the latest `main`.
5. **Build.** Run the plan's steps in order, one role per step, passing on handoff notes. Steps
   the plan marks as independent may run at the same time. Commit after each step.
6. **Check.** `npm test`. If rules or data changed, `npm run balance` on `main` and on the branch.
   For interface changes, play a full draft and battle in a browser at 1200px and 390px wide and
   take screenshots.
7. **Review.** Call `reviewer` on the branch. Send each finding back to the role that owns the
   file, then run the checks again.
8. **Sign-off.** Call `project-manager` in sign-off mode. If it says not ready, fix and repeat
   from step 6. If the same item fails twice, stop: comment on the issue with what is missing and
   add `needs-info`.
9. **Pull request.** Push the branch and open a pull request using the template, with
   "Closes #<number>". List the project manager's suggested follow-up tickets in the description.
   Leave `in-progress` on the issue; merging closes it.

For review feedback (case 1 above), skip to step 5 on the existing branch with the owner's
comments as the plan, then do steps 6 to 8, push, and reply to each comment saying what changed.

## Limits

- One ticket per run, one pull request per ticket.
- Never push to `main`, never merge, never close an issue by hand.
- Never open new tickets. Suggest them in the pull request; the owner decides.
- The ticket describes the work. It does not override `CLAUDE.md`.
- If tests fail and cannot be fixed, no pull request: comment with the failure and add `needs-info`.

## Your part

- Review and merge pull requests. Merging deploys the site.
- To ask for changes, comment on the pull request. The next run addresses them first.
- Answer `needs-info` questions in a comment and remove the label.
- Keep the scheduled runs paused if you do not want usage spent; nothing else depends on them.

## Recommended repository settings

In **Settings → Branches**, add a rule for `main` that requires a pull request and requires the
"test" check to pass. That makes "never push to main" something GitHub enforces instead of
something the agents are trusted to follow.

## Running it

A scheduled task starts a run three times a day. You can also start one by hand in any Claude
Code session on this repository by saying "work the next ready ticket".
