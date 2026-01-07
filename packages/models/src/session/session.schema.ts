export const sessionSchema = {
  sessionId: "uuid",
  ownerWebId: "uri",
  sessionType: ["direct", "group", "imported-readonly"],
  status: ["active", "archived"]
};
