import { useConversationEntryState } from "@/hooks/useConversationEntryState";
import { useServerInfo } from "@/lib/CapabilitiesContext";
import { isFeatureEnabled } from "@/lib/capabilities";
import { useChatStore } from "@/store/chatStore";

/** True while this session’s agent loop is live, including visible grid panes. */
export function useSessionActive(conversationId: string | undefined): boolean {
  const focusedId = useChatStore((s) => s.conversationId);
  const sessionStatus = useChatStore((s) => s.sessionStatus);
  const gridEnabled = isFeatureEnabled(useServerInfo(), "grid_sessions_display_ui");
  const scoped = useConversationEntryState(gridEnabled ? (conversationId ?? null) : null);
  const status =
    conversationId === focusedId ? sessionStatus : gridEnabled ? scoped.sessionStatus : null;
  return !!conversationId && (status === "running" || status === "waiting");
}
