export const importJobSchema = {
  jobId: "uuid",
  sourceType: ["chat", "audio", "file"],
  status: ["pending", "processing", "completed", "failed"]
};
