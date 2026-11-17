# Lane progress

Each lane of the parallel build ([`../parallel-plan.md`](../parallel-plan.md)) writes its progress here, in `<lane>.md` (`a.md`, `b.md`, `c.md`, `d.md`), on its own branch. The coordinator (lane 0) folds them into `STATUS.md` when a slice is merged. `server-log.md` holds every command and its output from the step 3 server setup.

Write each entry as: the slice, its PR, merged or not, what is next, anything blocked or waiting on another lane.
