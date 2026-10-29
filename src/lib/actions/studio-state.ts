import type { StudioCard } from "@/lib/ai/schemas/studio";
import type { StudioKind } from "@/lib/validation/studio";

export type StudioState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "result";
      kind: StudioKind;
      card: StudioCard;
      sample: boolean;
      /** The learner already has this expression in My English. */
      savedItemId: string | null;
      /** Distinguishes two lookups of the same expression. */
      resultAt: number;
    };

export const IDLE_STUDIO_STATE: StudioState = { status: "idle" };

export type SaveItemState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; itemId: string; alreadySaved: boolean };

export const IDLE_SAVE_STATE: SaveItemState = { status: "idle" };
