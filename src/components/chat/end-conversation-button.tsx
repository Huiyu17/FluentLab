"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { endConversationAction } from "@/lib/actions/conversation";

function ConfirmEnd() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Ending…" : "End and get feedback"}
    </Button>
  );
}

/** Ending is final (no more messages), so it asks once inline. */
export function EndConversationButton({ conversationId }: { conversationId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        End conversation
      </Button>
    );
  }
  return (
    <form action={endConversationAction} className="flex flex-wrap items-center gap-2" aria-live="polite">
      <span className="text-sm">End now? You can&apos;t add more messages after this.</span>
      <input type="hidden" name="conversationId" value={conversationId} />
      <ConfirmEnd />
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep talking
      </Button>
    </form>
  );
}
