import { use } from "react";
import FormClient from "./FormClient";

export default function FormConfigurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <FormClient formRecordId={id} />;
}
