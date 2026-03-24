'use client';

import * as React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  AlertTriangle,
  BookOpen,
  Briefcase,
  Wrench,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { LogoChattiphy } from '@/components/ui/logo-chattiphy';

const navMain = [
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Conversations',
    url: '/conversations',
    icon: MessageSquare,
  },
  {
    title: 'Escalations',
    url: '/escalations',
    icon: AlertTriangle,
  },
  {
    title: 'Knowledge Base',
    url: '/knowledge',
    icon: BookOpen,
  },
  {
    title: 'Tools',
    url: '/tools',
    icon: Wrench,
  },
  {
    title: 'Use Cases',
    url: '/use-cases',
    icon: Briefcase,
  },
];

const secondaryData: Record<string, { title: string; url: string; teaser?: string }[]> = {
  Dashboard: [{ title: 'Overview', url: '/dashboard', teaser: 'View KPIs and dashboard insights' }],
  Conversations: [
    {
      title: 'All Conversations',
      url: '/conversations',
      teaser: 'View all active and inactive chats',
    },
  ],
  Escalations: [
    { title: 'Pending Escalations', url: '/escalations', teaser: 'Handle user escalations' },
  ],
  'Knowledge Base': [
    { title: 'Documents', url: '/knowledge', teaser: 'Manage RAG documents and data' },
  ],
  'Use Cases': [
    {
      title: 'Prompt Policies',
      url: '/use-cases',
      teaser: 'Manage use cases and prompt behaviors',
    },
  ],
};

export function AppSidebar({
  userEmail,
  userRole,
  ...props
}: React.ComponentProps<typeof Sidebar> & { userEmail: string; userRole: string }) {
  const pathname = usePathname();
  useSidebar();

  // Determine active item based on pathname matching
  const activeItemIndex = navMain.findIndex((item) => {
    if (item.url === '/dashboard') {
      return pathname === '/dashboard' || pathname === '/';
    }
    return pathname.startsWith(item.url);
  });
  const activeItem = (activeItemIndex !== -1 ? navMain[activeItemIndex] : navMain[0])!;

  const secondaryItems = secondaryData[activeItem.title] || [];
  const showSecondary =
    pathname.startsWith('/conversations') || pathname.startsWith('/escalations');

  return (
    <Sidebar
      collapsible="icon"
      className="overflow-hidden *:data-[sidebar=sidebar]:flex-row"
      {...props}
    >
      {/* Primary Sidebar - Expanded by Default */}
      <Sidebar collapsible="none" className="border-r">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild className="md:h-8 md:p-0">
                <Link href="/dashboard">
                  <div className="flex items-center justify-center rounded-lg bg-transparent px-1">
                    <LogoChattiphy className="h-6 w-auto max-w-[120px]" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">WA Chat Ops</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="px-1.5 md:px-0">
              <SidebarMenu>
                {navMain
                  .filter((item) => item.title !== 'Use Cases')
                  .map((item) => {
                    let isActive = false;
                    if (item.url === '/dashboard') {
                      isActive = pathname === '/dashboard' || pathname === '/';
                    } else {
                      isActive = pathname.startsWith(item.url);
                    }

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          tooltip={{
                            children: item.title,
                            hidden: false,
                          }}
                          isActive={isActive}
                          className="px-2.5 md:px-2"
                          asChild
                        >
                          <Link href={item.url}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={{ name: userRole, email: userEmail, avatar: '' }} />
        </SidebarFooter>
      </Sidebar>

      {/* Secondary Sidebar - Section Nav */}
      {showSecondary && (
        <Sidebar collapsible="none" className="hidden flex-1 md:flex">
          <SidebarHeader className="gap-3.5 border-b p-4">
            <div className="flex w-full items-center justify-between">
              <div className="text-base font-medium text-foreground">{activeItem?.title}</div>
              <ThemeToggle />
            </div>
            <SidebarInput placeholder="Search within..." />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup className="px-0">
              <SidebarGroupContent>
                {secondaryItems.map((sItem) => (
                  <Link
                    href={sItem.url}
                    key={sItem.title}
                    className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    <span className="font-medium text-foreground">{sItem.title}</span>
                    {sItem.teaser && (
                      <span className="line-clamp-2 w-full text-xs text-muted-foreground whitespace-break-spaces">
                        {sItem.teaser}
                      </span>
                    )}
                  </Link>
                ))}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      )}
    </Sidebar>
  );
}
