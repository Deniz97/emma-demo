"use server";

import { prisma } from "@/lib/prisma";
import { z } from "zod";

const deviceKeySchema = z.string().min(1);

export async function getOrCreateUser(deviceKey: string) {
  const validatedKey = deviceKeySchema.parse(deviceKey);

  let user = await prisma.user.findUnique({
    where: { deviceKey: validatedKey },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { deviceKey: validatedKey },
    });
  }

  return user;
}

