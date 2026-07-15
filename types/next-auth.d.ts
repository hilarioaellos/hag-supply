import "next-auth";
import "next-auth/jwt";
import { Role } from "@prisma/client";

declare module "next-auth" {
  interface User {
    id: string;
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      email: string;
      name: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
