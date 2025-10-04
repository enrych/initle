import { Button } from "components/button";
import { APP_NAME, HTTP_METHOD } from "constants/global.constants";
import { HOMEPAGE_TEXT } from "./homepage.constants";
import { Input } from "components/input";
import { api } from "utils/api";
import { useRef } from "react";
import { useNavigate } from "react-router";
import { useSocket } from "contexts/SocketContext";
import { usePlayerStore } from "store/playerStore";

const Homepage = () => {
  const usernameRef = useRef<HTMLInputElement>(null);
  const { socket, connect } = useSocket();
  const { setPlayer, setRoom } = usePlayerStore();
  const navigate = useNavigate();

  const handlePlay = async () => {
    const username = usernameRef.current?.value;
    if (!username) {
      alert("Please enter a username");
      return;
    }

    try {
      const { roomId, playerId, playerUsername } = await api("play", {
        method: HTTP_METHOD.POST,
        body: {
          username,
        },
      });

      setPlayer(playerId, playerUsername);
      setRoom(roomId);
      navigate(`/lobby/${roomId}`);
    } catch (error) {
      console.error("Failed to enter a room!");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-screen">
      <h1 className="text-4xl">{APP_NAME}</h1>
      <div className="flex flex-col items-stretch gap-2">
        <Input
          type="text"
          placeholder="Enter Your Username"
          ref={usernameRef}
        />
        <Button onClick={handlePlay}>{HOMEPAGE_TEXT.PLAY}</Button>
        <div className="flex gap-1">
          <Button className="flex-1">{HOMEPAGE_TEXT.CREATE}</Button>
          <Button className="flex-1">{HOMEPAGE_TEXT.JOIN}</Button>
        </div>
        <Button>{HOMEPAGE_TEXT.HOW_TO_PLAY}</Button>
      </div>
    </div>
  );
};

export default Homepage;
