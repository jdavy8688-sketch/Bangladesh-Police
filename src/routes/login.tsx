import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

/** Local User ID / password sign-in removed — enterprise (portal) OAuth is used. */
function LoginPage() {
  return <Navigate to="/" />;
}
