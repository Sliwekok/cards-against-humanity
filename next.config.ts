import type { NextConfig } from "next";
import os from "node:os";

// Adresy IP tego komputera w sieci lokalnej – żeby inne urządzenia
// (telefony, laptopy) mogły korzystać z trybu deweloperskiego.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
