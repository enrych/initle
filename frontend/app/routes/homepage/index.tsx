import { Button } from "components/button";
import { APP_NAME, HTTP_METHOD } from "constants/global.constants";
import { HOMEPAGE_TEXT } from "./homepage.constants";
import { Input } from "components/input";
import { api } from "utils/api";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { usePlayerStore } from "store/playerStore";

const Homepage = () => {
  const usernameRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { playerId, auth } = usePlayerStore();
  const [loading, setLoading] = useState(false);

  const handlePlay = async () => {
    const usernameInput = usernameRef.current?.value?.trim();
    setLoading(true);

    try {
      let id = playerId;

      if (!id) {
        const result = await auth({ username: usernameInput });

        if (!result) {
          throw new Error("Authentication failed");
        }

        id = result.playerId;
      }

      if (!id) throw new Error("Authentication failed");

      const { roomId } = await api("play", {
        method: HTTP_METHOD.POST,
        body: { playerId: id },
      });

      navigate(`/lobby/${roomId}`);
    } catch (error) {
      console.error("Failed to enter a room!", error);
      alert("Failed to enter a room. Please try again.");
    } finally {
      setLoading(false);
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

        <Button onClick={handlePlay} disabled={loading}>
          {loading ? "Loading..." : HOMEPAGE_TEXT.PLAY}
        </Button>

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
