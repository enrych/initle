import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/homepage/index.tsx"),
  route("lobby/:roomId", "routes/lobby/index.tsx"),
] satisfies RouteConfig;
