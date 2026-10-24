import type { Metadata } from "next";
import { PersonalApp } from "../personal/personal-app";
import { emptyLife, localDay } from "@/lib/life/domain";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Миний өдөр · Шинэ хувилбарыг турших",
};
export default async function LifeDemo({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  const params = await searchParams;
  const sample = emptyLife();
  if (params.empty !== "1") {
    sample.goal = {
      area: "management",
      title: "Өдрөө тайван эхлүүлж, чухал ажлаа амжуулдаг болох",
      why: "Өөртөө болон гэр бүлдээ цаг үлдээмээр байна.",
      measure: "7 хоногт 3 удаа сонгосон нэг ажлаа хийсэн байна.",
      weeklyMinutes: 60,
    };
    sample.tasks = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        date: localDay(),
        title: "Маргаашийн хамгийн чухал ажлын эхний 3 алхмыг бичих",
        minutes: 10,
        time: "20:30",
        status: "planned",
        outcome: "",
      },
    ];
    sample.habit = { title: "Орой маргаашийн нэг ажлаа сонгох", dates: [] };
  }
  return <PersonalApp name="Номин" demo initialState={sample} />;
}
