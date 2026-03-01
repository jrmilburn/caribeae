import { getLevels } from "@/server/level/getLevels";
import { getSkills } from "@/server/skill/getSkills";

import { SkillsSection } from "../SkillsSection";

export default async function SkillsPage() {
  const [skills, levels] = await Promise.all([getSkills(), getLevels()]);

  return <SkillsSection skills={skills} levels={levels} />;
}
