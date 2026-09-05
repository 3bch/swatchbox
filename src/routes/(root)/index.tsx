import { createFileRoute } from "@tanstack/react-router";

/** トップページを描画する */
function Home() {
  return <div>swatchbox</div>;
}

export const Route = createFileRoute("/(root)/")({
  component: Home,
});
