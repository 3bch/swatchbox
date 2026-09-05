import { Outlet, createRootRoute } from "@tanstack/react-router";

/** 全ページ共通のレイアウトを描画する */
function RootLayout() {
  return <Outlet />;
}

export const Route = createRootRoute({
  component: RootLayout,
});
