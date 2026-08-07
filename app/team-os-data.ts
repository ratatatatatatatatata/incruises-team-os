export const learningLevels = [
  {
    id: "l0",
    level: "L0",
    title: "Компани ба нөхцөл",
    description: "Member, Partner-ийн ялгаа, албан дүрэм, зөв хүлээлт.",
    duration: "35 мин",
    lessons: [
      { id: "l0-1", title: "inCruises-ийн философи ба зорилго", type: "Хичээл", minutes: 8 },
      { id: "l0-2", title: "Member ба Partner-ийн ялгаа", type: "Хичээл", minutes: 10 },
      { id: "l0-3", title: "Амлалт өгөхгүй зөв тайлбарлах", type: "Role-play", minutes: 12 },
      { id: "l0-4", title: "L0 мэдлэгийн шалгалт", type: "Quiz", minutes: 5 },
    ],
  },
  {
    id: "l1",
    level: "L1",
    title: "Бүтээгдэхүүн тайлбарлах",
    description: "Membership 3.X, аяллын төлөвлөлт, бодит хэрэглээ.",
    duration: "48 мин",
    lessons: [
      { id: "l1-1", title: "Membership 3.X үндсэн ойлголт", type: "Хичээл", minutes: 12 },
      { id: "l1-2", title: "Аяллын зорилгыг тодруулах", type: "Workshop", minutes: 10 },
      { id: "l1-3", title: "Үнэ цэнийг харьцуулж тайлбарлах", type: "Role-play", minutes: 16 },
      { id: "l1-4", title: "L1 teach-back", type: "Assessment", minutes: 10 },
    ],
  },
  {
    id: "l2",
    level: "L2",
    title: "Зөв яриа ба сонсох",
    description: "Discovery, follow-up, татгалзлыг дарамтгүй удирдах.",
    duration: "55 мин",
    lessons: [
      { id: "l2-1", title: "Discovery асуултын бүтэц", type: "Хичээл", minutes: 10 },
      { id: "l2-2", title: "Хэрэгцээг буцааж баталгаажуулах", type: "Role-play", minutes: 15 },
      { id: "l2-3", title: "Follow-up-ийн 3 алхам", type: "Workshop", minutes: 15 },
      { id: "l2-4", title: "L2 conversation review", type: "Assessment", minutes: 15 },
    ],
  },
  {
    id: "l3",
    level: "L3–4",
    title: "Member Success ба Builder",
    description: "72 цаг, 30/60/90 хоногийн үйлчилгээ, баг өсгөх чадвар.",
    duration: "1 цаг 20 мин",
    lessons: [
      { id: "l3-1", title: "72 цагийн onboarding", type: "Playbook", minutes: 18 },
      { id: "l3-2", title: "30/60/90 success review", type: "Workshop", minutes: 20 },
      { id: "l3-3", title: "Builder-ийн долоо хоногийн хэмнэл", type: "Playbook", minutes: 22 },
      { id: "l3-4", title: "Member Success teach-back", type: "Assessment", minutes: 20 },
    ],
  },
  {
    id: "l5",
    level: "L5–6",
    title: "Coach ба Director readiness",
    description: "Систем, coaching, balance, эрсдэлийн удирдлага.",
    duration: "1 цаг 45 мин",
    lessons: [
      { id: "l5-1", title: "Coach review rubric", type: "Playbook", minutes: 20 },
      { id: "l5-2", title: "Багийн KPI ба bottleneck", type: "Workshop", minutes: 25 },
      { id: "l5-3", title: "Compliance escalation", type: "Simulation", minutes: 25 },
      { id: "l5-4", title: "Director readiness board", type: "Assessment", minutes: 35 },
    ],
  },
] as const;

export const officialSources = [
  {
    id: "membership-agreement",
    title: "Membership Agreement 3.2",
    category: "Member",
    status: "Current",
    verified: "2026-04-02",
    url: "https://files.incruises.com/files/en/106EN_3.2_MEMBER_AGREEMENT.pdf",
  },
  {
    id: "membership-faq",
    title: "Membership 3.X FAQ",
    category: "Product",
    status: "Current",
    verified: "2026",
    url: "https://files.incruises.com/en/EN_Membership_3.X_FAQs.pdf",
  },
  {
    id: "partner-agreement",
    title: "Independent Partner Agreement",
    category: "Partner",
    status: "Current",
    verified: "2026 review",
    url: "https://files.incruises.com/files/en/104EN_3.2_INDEPENDENT_PARTNER_AGREEMENT.pdf",
  },
  {
    id: "policies",
    title: "Policies & Procedures Manual",
    category: "Compliance",
    status: "Current",
    verified: "2026 review",
    url: "https://files.incruises.com/files/en/203EN_POLICIES_AND_PROCEDURES_MANUAL.pdf",
  },
  {
    id: "brand-policy",
    title: "Marketing Materials & Branding Policy",
    category: "Content",
    status: "Current",
    verified: "2026 review",
    url: "https://files.incruises.com/files/en/207EN_MARKETING_MATERIALS_AND_BRANDING_POLICY.pdf",
  },
  {
    id: "income-guide",
    title: "Income & Incentive Guide",
    category: "Compensation",
    status: "Current",
    verified: "2026 review",
    url: "https://files.incruises.com/files/en/214EN_INCOME_AND_INCENTIVE_GUIDE.pdf",
  },
] as const;

export type WorkspacePayload = {
  progress: Array<{ lessonId: string; status: string; score: number | null }>;
  drafts: Array<{
    id: number;
    title: string;
    channel: string;
    sourceId: string;
    status: string;
    excerpt: string;
    createdAt: string;
  }>;
  memberTasks: Array<{
    id: number;
    memberName: string;
    milestone: string;
    nextAction: string;
    dueLabel: string;
    risk: string;
    status: string;
  }>;
};
