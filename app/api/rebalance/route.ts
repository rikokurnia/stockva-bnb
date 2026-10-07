import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    {
      error:
        "The previous simulation vault is retired. Review and execute individual BSC mainnet trades in the Stock Exchange.",
    },
    { status: 410 },
  );
}
