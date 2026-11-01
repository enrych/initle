import { Suspense, lazy } from "react";
import { Link, Outlet, createBrowserRouter } from "react-router";
import { Toaster } from "./components/Toasts";
import { Backdrop, Button, Logo, Spinner } from "./components/ui";
import { Home } from "./pages/Home";

const RoomPage = lazy(() => import("./pages/RoomPage").then((m) => ({ default: m.RoomPage })));
const StagePage = lazy(() => import("./pages/Stage").then((m) => ({ default: m.StagePage })));
const DailyPage = lazy(() => import("./pages/Daily").then((m) => ({ default: m.DailyPage })));
const PackNewPage = lazy(() => import("./pages/Packs").then((m) => ({ default: m.PackNewPage })));
const PackLandingPage = lazy(() => import("./pages/Packs").then((m) => ({ default: m.PackLandingPage })));

function Loading() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Spinner className="h-8 w-8" />
    </main>
  );
}

function Layout() {
  return (
    <>
      <Backdrop />
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
      <Toaster />
    </>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Logo />
      <h1 className="font-display text-3xl font-bold">P·N·F</h1>
      <p className="text-muted">Page Not Found. That one was easy.</p>
      <Link to="/">
        <Button>Home</Button>
      </Link>
    </main>
  );
}

function ErrorPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <Logo />
      <h1 className="font-display text-2xl font-bold">Something broke</h1>
      <p className="text-muted">Sorry about that. Reloading usually fixes it, and your seat in a room is kept.</p>
      <Button onClick={() => location.reload()}>Reload</Button>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/r/:code", element: <RoomPage /> },
      { path: "/stage/:code", element: <StagePage /> },
      { path: "/daily", element: <DailyPage /> },
      { path: "/packs/new", element: <PackNewPage /> },
      { path: "/p/:id", element: <PackLandingPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
