# Changelog

The version is shown at the bottom of Settings. Bump it before every update
(see "Versioning and updates" in README.md). Pushing a new version to master publishes it to the preview channel.

## 1.2.2

- Pips: tap a placed domino to pick it up (it lifts, with a blue edge and a shadow), tap it again to turn it, drag it to move it
- Pips: turning a domino swings it round smoothly, on the board and in the tray
- Pips: tap empty space to put down a picked-up domino
- Pips: Clear button puts every domino back in the tray; Rewind is gone and wrong placements are no longer counted as mistakes
- Calcudoku: digits and pencil marks are the same size in every cell, cage label or not
- Calcudoku and Kakuro: auto candidates leave the sums to you; a new setting, "Auto candidates: arithmetic", brings them back
- With no cell selected, tapping a number highlights it on the board, even before it is placed; tap the selected cell again to let go of it
- Hints no longer repeat forever when a cell's pencil marks are incomplete (Calcudoku, sudoku and Kakuro)

## 1.2.1

- Pips: drag dominoes from the tray onto the board, move placed ones, or drag them off to put them back
- Pips: tap a tray domino again to turn it before laying it; tapping a placed domino turns it clockwise around the half you tap
- Pips: no error detection or auto-finish, which gave the answer away; Rewind is always available
- Pips (web): dragging a domino you just placed no longer gets cancelled by the browser

## 1.2.0

- New game: Pips (after the NYT domino game), with Medium to Extreme levels graded by technique, hints and auto-finish

## 1.1.3

- Correcting a wrong digit (overwriting, tapping it off or erasing) gives its candidates back to the cells it had cleared
- New app icon
- Runtime version follows the Expo SDK (needs the new APK to receive updates)

## 1.1.2

- Updates reach the installed app again: runtime version pinned to 1.0.0 (matches the preview APK)

## 1.1.1

- A removed correct candidate stays a mistake (red cell, Rewind, hint) even after the cell's other candidates are removed or erased

## 1.1.0

- Removing a cell's correct candidate counts as a mistake, turns the cell red and is a Rewind point
- Auto candidates on by default
- Candidate highlights keep their rounded-square shape on Android
- Version and update details shown in Settings

## 1.0.0

- Classic sudoku with Medium to Extreme levels graded by technique
- Jigsaw, Windoku, 16×16, Samurai, Calcudoku, Kakuro and Tents
- Pencil marks, candidate hints, undo, rewind to first mistake, auto-finish
