# How work gets done

## The board

Tickets are GitHub Issues, shown on a GitHub Projects board with these columns:

| Column | Meaning |
|---|---|
| Backlog | Ideas. Nobody works on these yet |
| Ready | You have decided this should be built. Add the `ready` label |
| In progress | An agent has picked it up (label `in-progress`) |
| In review | A pull request is open and waiting for you |
| Done | Merged and live |

To ask for something: open an issue with the Ticket template, then add the `ready` label when
you want it built. Moving a card to Done happens by merging its pull request.

## What the agent does with a ready ticket

1. Takes the oldest open issue labelled `ready` that is not `in-progress`, and labels it `in-progress`.
2. Creates the branch `ticket/<number>-<short-name>` from `main`.
3. Hands the work to the right role (`.claude/agents/`): engine-dev, ui-dev or content-designer.
   A ticket that touches more than one area is split between them.
4. Runs `npm test`, and `npm run balance` if rules or data changed.
5. Has the reviewer role check the branch, and fixes what it finds.
6. Opens a pull request that says "Closes #<number>", with screenshots for interface changes.
7. If the ticket is unclear, it asks a question in a comment on the issue, adds the label
   `needs-info` and moves on to the next ticket instead of guessing.

It never merges its own pull requests and never pushes to `main`. You review and merge; merging
deploys the site.

## One ticket at a time

The agent works one ticket per run. A scheduled task starts a run a few times a day, so tickets
are picked up as usage allows. You can also start a run by hand at any time by asking Claude to
"work the next ready ticket".
