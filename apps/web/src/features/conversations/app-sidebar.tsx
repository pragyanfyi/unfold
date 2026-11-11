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
  SidebarFooter,
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
import { conversationListQuery, storagePersistedQuery } from "#/features/storage/queries";
import type { ConversationRecord } from "#/features/storage/types";
import { DeleteDialog, RenameDialog } from "./conversation-dialogs";

// The list of saved ideas (sidebar-08, inset variant). Everything here is local to this
// browser (ADR 0013).
export function AppSidebar({
  onNew,
  onDeleted,
}: {
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const list = useQuery(conversationListQuery());
  const persisted = useQuery(storagePersistedQuery());
  const { id: activeId } = useParams({ strict: false }) as { id?: string };
  const { isMobile, setOpenMobile } = useSidebar();
  const [renaming, setRenaming] = useState<ConversationRecord | null>(null);
  const [deleting, setDeleting] = useState<ConversationRecord | null>(null);
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <>
      <Sidebar variant="inset" aria-label="Saved ideas">
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
              {list.isPending ? (
                <SidebarMenu>
                  {[0, 1, 2].map((n) => (
                    <SidebarMenuItem key={n}>
                      <SidebarMenuSkeleton />
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              ) : list.isError ? (
                <p role="alert" className="px-2 text-sm text-muted-foreground">
                  Saved ideas could not be read from this browser. New ideas will not be saved.
                </p>
              ) : list.data.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">
                  Ideas you explore are saved here, in this browser.
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
        <SidebarFooter>
          <p className="px-2 text-xs text-muted-foreground">
            Saved in this browser only
            {persisted.data ? "" : ", and the browser may clear it when space runs low"}. Private
            windows usually lose it when the private session ends.
          </p>
        </SidebarFooter>
      </Sidebar>
      <RenameDialog record={renaming} onClose={() => setRenaming(null)} />
      <DeleteDialog record={deleting} onClose={() => setDeleting(null)} onDeleted={onDeleted} />
    </>
  );
}
