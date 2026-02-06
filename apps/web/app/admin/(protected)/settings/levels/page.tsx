import { getLevels } from "@/server/level/getLevels";

import { LevelsSection } from "../LevelsSection";

export default async function LevelsPage() {
  const levels = await getLevels();

  return <LevelsSection levels={levels} />;
}
