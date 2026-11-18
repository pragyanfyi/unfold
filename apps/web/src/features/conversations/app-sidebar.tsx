import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "#/components/ui/sidebar";
import { useSession } from "#/features/auth/session";
import { conversationListQuery } from "#/features/storage/queries";
import type { ConversationRecord } from "#/features/storage/types";
import { DeleteDialog, RenameDialog } from "./conversation-dialogs";

// The list of saved ideas (sidebar-08, inset variant). They are stored in Convex, with the
// signed-in account (ADR 0015).
export function AppSidebar({
  onNew,
  onDeleted,
}: {
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  // Ideas are shown only to a signed-in user (ADR 0016).
  const { status } = useSession();
  const list = useQuery(conversationListQuery(status === "signed-in"));
  const { id: activeId } = useParams({ strict: false }) as { id?: string };
  const { isMobile, setOpenMobile } = useSidebar();
  const [renaming, setRenaming] = useState<ConversationRecord | null>(null);
  const [deleting, setDeleting] = useState<ConversationRecord | null>(null);
  // Signing out closes an open rename or delete: neither may act once the session has ended.
  if (status !== "signed-in" && (renaming || deleting)) {
    setRenaming(null);
    setDeleting(null);
  }
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <Sidebar variant="inset" role="navigation" aria-label="Saved ideas">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  onNew();
                  closeOnMobile();
                }}
              >
                <PlusIcon />
                <span>New idea</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Your ideas</SidebarGroupLabel>
            <SidebarGroupContent>
              {status === "signed-out" ? (
                <p className="px-2 text-sm text-muted-foreground">Sign in to see your ideas.</p>
              ) : status === "loading" || list.isPending ? (
                <SidebarMenu>
                  {[0, 1, 2].map((n) => (
                    <SidebarMenuItem key={n}>
                      <SidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              ) : list.isError ? (
                <p role="alert" className="px-2 text-sm text-muted-foreground">
                  Your saved ideas could not be loaded.
                </p>
              ) : list.data.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">
                  Ideas you explore are saved here, with your account.
                </p>
              ) : (
                <SidebarMenu>
                  {list.data.map((record) => (
                    <SidebarMenuItem key={record.id}>
                      <SidebarMenuButton asChild isActive={record.id === activeId}>
                        <Link to="/c/$id" params={{ id: record.id }} onClick={closeOnMobile}>
                          <span>{record.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction>
                            <MoreHorizontalIcon />
                            <span className="sr-only">Actions for {record.title}</span>
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem onSelect={() => setRenaming(record)}>
                            <PencilIcon /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(record)}
                          >
                            <Trash2Icon /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <RenameDialog record={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog record={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
    </>
  );
}
