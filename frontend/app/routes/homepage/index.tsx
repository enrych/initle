import { Button } from "components/button";
import { APP_NAME } from "constants/global.constants";
import { HOMEPAGE_TEXT } from "./homepage.constants";
import { Input } from "components/input";

export default function Home() {
  return (
    <div>
      <h1>{APP_NAME}</h1>
      <div className="flex flex-col items-stretch gap-2">
        <Input type="text" placeholder="Enter Your Username" />
        <Button>{HOMEPAGE_TEXT.PLAY}</Button>
        <div className="flex gap-1">
          <Button className="flex-1">{HOMEPAGE_TEXT.CREATE}</Button>
          <Button className="flex-1">{HOMEPAGE_TEXT.JOIN}</Button>
        </div>
        <Button>{HOMEPAGE_TEXT.HOW_TO_PLAY}</Button>
      </div>
    </div>
  );
}
