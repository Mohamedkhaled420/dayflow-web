"use client";

// Maps the icon key stored on a category to a lucide-react glyph.

import {
  Briefcase,
  Circle,
  Coffee,
  Dumbbell,
  Laptop,
  Moon,
  Utensils,
  GlassWater,
  BookOpen,
  Gamepad2,
  Heart,
  Music,
  Plane,
  GraduationCap,
  Baby,
  Car,
  Palette,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  laptop: Laptop,
  dumbbell: Dumbbell,
  utensils: Utensils,
  moon: Moon,
  "glass-water": GlassWater,
  coffee: Coffee,
  circle: Circle,
  book: BookOpen,
  gamepad: Gamepad2,
  heart: Heart,
  music: Music,
  plane: Plane,
  study: GraduationCap,
  family: Baby,
  car: Car,
  palette: Palette,
};

export const CATEGORY_ICON_KEYS = Object.keys(ICONS);

export function CategoryIcon({
  name,
  className,
  style,
  strokeWidth = 1.9,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}) {
  const Icon = ICONS[name] ?? Circle;
  return <Icon className={className} style={style} strokeWidth={strokeWidth} />;
}
