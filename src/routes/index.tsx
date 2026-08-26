import { createFileRoute } from "@tanstack/react-router";

import { Home } from "#/components/home.tsx";

export const Route = createFileRoute("/")({
  component: Home,
});
