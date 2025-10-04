import type { Route } from "./+types";

type LobbyProps = {
  params: Route.LoaderArgs;
};

const Lobby = ({ params }: LobbyProps) => {
  const { roomId } = params;
  return <div></div>;
};

export default Lobby;
