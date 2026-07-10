import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@ditofeito/api";

export const trpc = createTRPCReact<AppRouter>();
