import {
  Archive,
  Bookmark,
  House,
  Receipt,
  Search,
  Settings,
  Shirt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  feature?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/discover/", label: "Discover", icon: Search },
  { href: "/dresser/", label: "3D Dresser", short: "Dresser", icon: Shirt, feature: true },
  { href: "/stylist/", label: "AI Stylist", short: "Stylist", icon: Sparkles },
  { href: "/wardrobe/", label: "My Wardrobe", short: "Wardrobe", icon: Archive },
  { href: "/outfits/", label: "Saved Outfits", short: "Outfits", icon: Bookmark },
  { href: "/history/", label: "Shopping History", short: "History", icon: Receipt },
  { href: "/settings/", label: "Profile & Settings", short: "Profile", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return href === "/" ? p === "/" : p.startsWith(href);
}
