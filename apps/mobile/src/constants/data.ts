export const levels = [
  { id: 'l0', label: 'L0', title: 'Компани ба нөхцөл', note: 'Member, Partner-ийн ялгаа, албан дүрэм, зөв хүлээлт.', lessons: [
    ['l0-1', 'inCruises-ийн философи ба зорилго', '8 мин'], ['l0-2', 'Member ба Partner-ийн ялгаа', '10 мин'], ['l0-3', 'Амлалт өгөхгүй зөв тайлбарлах', '12 мин'], ['l0-4', 'L0 мэдлэгийн шалгалт', '5 мин'],
  ]},
  { id: 'l1', label: 'L1', title: 'Бүтээгдэхүүн тайлбарлах', note: 'Membership 3.X, аяллын төлөвлөлт, бодит хэрэглээ.', lessons: [
    ['l1-1', 'Membership 3.X үндсэн ойлголт', '12 мин'], ['l1-2', 'Аяллын зорилгыг тодруулах', '10 мин'], ['l1-3', 'Үнэ цэнийг харьцуулж тайлбарлах', '16 мин'], ['l1-4', 'L1 teach-back', '10 мин'],
  ]},
  { id: 'l2', label: 'L2', title: 'Зөв яриа ба сонсох', note: 'Discovery, follow-up, татгалзлыг дарамтгүй удирдах.', lessons: [
    ['l2-1', 'Discovery асуултын бүтэц', '10 мин'], ['l2-2', 'Хэрэгцээг буцааж баталгаажуулах', '15 мин'], ['l2-3', 'Follow-up-ийн 3 алхам', '15 мин'], ['l2-4', 'L2 conversation review', '15 мин'],
  ]},
] as const;

export const sources = [
  ['Membership Agreement 3.2', 'Member', 'https://files.incruises.com/files/en/106EN_3.2_MEMBER_AGREEMENT.pdf'],
  ['Membership 3.X FAQ', 'Product', 'https://files.incruises.com/en/EN_Membership_3.X_FAQs.pdf'],
  ['Independent Partner Agreement', 'Partner', 'https://files.incruises.com/files/en/104EN_3.2_INDEPENDENT_PARTNER_AGREEMENT.pdf'],
  ['Policies & Procedures Manual', 'Compliance', 'https://files.incruises.com/files/en/203EN_POLICIES_AND_PROCEDURES_MANUAL.pdf'],
] as const;
