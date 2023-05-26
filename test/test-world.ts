import { AnchorProvider, BN, Wallet, web3 } from '@coral-xyz/anchor'
import { MarinadeUtils } from '../src'

export const MINIMUM_LAMPORTS_BEFORE_TEST = MarinadeUtils.solToLamports(2.5)
export const LAMPORTS_AIRDROP_CAP = MarinadeUtils.solToLamports(2)

// 9wmxMQ2TFxYh918RzESjiA1dUXbdRAsXBd12JA1vwWQq
export const SDK_USER = web3.Keypair.fromSecretKey(
  new Uint8Array([
    120, 45, 242, 38, 63, 135, 84, 226, 66, 56, 76, 216, 125, 144, 38, 182, 53,
    47, 169, 251, 128, 65, 185, 237, 41, 47, 64, 53, 158, 124, 64, 2, 132, 229,
    176, 107, 25, 190, 28, 223, 58, 136, 95, 237, 236, 176, 26, 160, 11, 12,
    131, 129, 21, 8, 221, 100, 249, 221, 177, 114, 143, 231, 102, 250,
  ])
)
// for local validator testing the SDK USER is a predefined account having enough SOL
console.log('SDK User', SDK_USER.publicKey.toBase58())

// 2APsntHoKXCeHWfxZ49ADwc5XrdB8GGmxK34jVXRYZyV
export const MARINADE_STATE_ADMIN = web3.Keypair.fromSecretKey(
  new Uint8Array([
    88, 46, 254, 11, 76, 182, 135, 63, 92, 56, 112, 173, 43, 58, 65, 74, 13, 97,
    203, 36, 231, 178, 221, 92, 234, 200, 208, 114, 32, 230, 251, 217, 17, 67,
    199, 164, 137, 164, 176, 85, 236, 29, 246, 150, 180, 35, 94, 120, 30, 17,
    18, 138, 253, 155, 218, 23, 84, 125, 225, 110, 37, 142, 253, 100,
  ])
)

// used for the base tests that cannot start the localhost provider
export const PROVIDER_URL_DEVNET = 'https://api.devnet.solana.com'
export const CONNECTION_DEVNET = new web3.Connection(PROVIDER_URL_DEVNET, {
  commitment: 'confirmed',
})

export const PROVIDER_URL = 'http://localhost:8899'
export const CONNECTION = new web3.Connection(PROVIDER_URL, {
  commitment: 'confirmed',
})
export const PROVIDER = new AnchorProvider(CONNECTION, new Wallet(SDK_USER), {
  commitment: 'confirmed' /*, skipPreflight: true*/,
})

export const REFERRAL_CODE = new web3.PublicKey(
  '2Q7u7ndBhSJpTNpDzkjvRyRvuzRLZSovkNRQ5SEUb64g'
)
export const PARTNER_NAME = 'marinade_ts_sdk'
console.log('Referral partner', PARTNER_NAME, REFERRAL_CODE.toBase58())

export const airdrop = async (to: web3.PublicKey, amountLamports: number) => {
  const signature = await CONNECTION.requestAirdrop(to, amountLamports)
  await CONNECTION.confirmTransaction(signature)
  console.log(
    'Airdrop:',
    MarinadeUtils.lamportsToSol(new BN(amountLamports)),
    'SOL',
    'to',
    to.toBase58()
  )
}

export const getBalanceLamports = async (account: web3.PublicKey) =>
  CONNECTION.getBalance(account)

export const airdropMinimumLamportsBalance = async (
  account: web3.PublicKey,
  minimumLamportsBalance: BN
) => {
  const balanceLamports = new BN(await getBalanceLamports(account))
  if (balanceLamports.gte(minimumLamportsBalance)) {
    return
  }

  let remainingLamportsToAirdrop = minimumLamportsBalance.sub(balanceLamports)
  while (remainingLamportsToAirdrop.gtn(0)) {
    const airdropLamports = BN.min(
      LAMPORTS_AIRDROP_CAP,
      remainingLamportsToAirdrop
    )
    await airdrop(account, airdropLamports.toNumber())
    remainingLamportsToAirdrop = remainingLamportsToAirdrop.sub(airdropLamports)
  }
}

export async function transferMinimumLamportsBalance(
  address: web3.PublicKey,
  provider: AnchorProvider = PROVIDER,
  lamports: BN = MINIMUM_LAMPORTS_BEFORE_TEST
): Promise<string> {
  const ix = web3.SystemProgram.transfer({
    fromPubkey: provider.publicKey, // wallet address, will sign
    toPubkey: address,
    lamports: BigInt(lamports.toString()),
  })
  const tx = new web3.Transaction().add(ix)
  return await provider.sendAndConfirm(tx)
}

export const simulateTransaction = async (transaction: web3.Transaction) => {
  const {
    context: { slot: executedSlot },
    value: { blockhash },
  } = await CONNECTION.getLatestBlockhashAndContext()
  transaction.recentBlockhash = blockhash
  transaction.feePayer = SDK_USER.publicKey

  const {
    context: { slot: simulatedSlot },
    value: { err, logs, unitsConsumed, accounts, returnData },
  } = await PROVIDER.connection.simulateTransaction(transaction)
  return {
    executedSlot,
    simulatedSlot,
    err,
    logs,
    unitsConsumed,
    accounts,
    returnData,
  }
}

let voteAccounts: web3.VoteAccountStatus | undefined
export const getVoteAccounts = async (): Promise<web3.VoteAccountStatus> => {
  if (!voteAccounts) {
    voteAccounts = await CONNECTION.getVoteAccounts()
  }
  if (!voteAccounts) {
    throw new Error(`Failed to get vote accounts from cluster ${PROVIDER_URL}`)
  }
  return voteAccounts
}

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}
