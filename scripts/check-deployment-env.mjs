import env from "@next/env";
import { deploymentEnvErrors } from "./deployment-env.mjs";

env.loadEnvConfig(process.cwd());
const errors = deploymentEnvErrors(process.env);
if (errors.length) {
  console.error(
    "Deployment configuration is incomplete:\n" +
      errors.map((error) => `- ${error}`).join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(
    "Deployment environment check passed. Secret values were not printed.",
  );
}
