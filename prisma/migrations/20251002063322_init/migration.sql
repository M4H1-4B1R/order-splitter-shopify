-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "splittingEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LocationMapping" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "locationGid" TEXT NOT NULL,

    CONSTRAINT "LocationMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SplitLog" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "originalOrderId" TEXT NOT NULL,
    "splitOrderIds" TEXT,
    "retained" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SplitLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "public"."AppSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "LocationMapping_shop_locationCode_key" ON "public"."LocationMapping"("shop", "locationCode");
