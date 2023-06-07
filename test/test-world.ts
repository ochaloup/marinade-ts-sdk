import { AnchorProvider, BN, Wallet, web3 } from '@coral-xyz/anchor'
import { Marinade, MarinadeUtils } from '../src'
import { STAKE_ACCOUNT } from './setup/globalSetup'
import { getParsedStakeAccountInfo } from '../src/util'

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

export async function airdrop(
  to: web3.PublicKey,
  amountLamports: number
): Promise<void> {
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

export async function airdropMinimumLamportsBalance(
  account: web3.PublicKey,
  minimumLamportsBalance: BN
): Promise<void> {
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

export async function simulateTransaction(transaction: web3.Transaction) {
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
export async function getVoteAccounts(): Promise<web3.VoteAccountStatus> {
  if (!voteAccounts) {
    voteAccounts = await CONNECTION.getVoteAccounts()
  }
  if (!voteAccounts) {
    throw new Error(`Failed to get vote accounts from cluster ${PROVIDER_URL}`)
  }
  return voteAccounts
}

export async function getSingleVoteAccount(): Promise<web3.PublicKey> {
  // expecting run on localhost and only one vote account is available
  // which comes from solana-test-validator
  const voteAccounts = await getVoteAccounts()
  if (voteAccounts.current.length !== 1) {
    throw new Error(
      'Expected one vote account of solana-test-validator. Cannot continue in global local test setup.' +
        ` Number of vote accounts found: ${voteAccounts.current.length}`
    )
  }
  return new web3.PublicKey(voteAccounts.current[0].votePubkey)
}

// for local validator testing the new stake account with delegation is configured
// for test validator by global jest setup,
// this function waits for the delegation being activated, or after timetout throws an error
// ---
// NOTE: the Anchor.toml configures slots_per_epoch to 32,
//       so the timeout of 30 seconds should be enough for the stake account to be activated
export async function waitForDelegationActivation({
  stakeAccount = STAKE_ACCOUNT.publicKey,
  connection = CONNECTION,
  timeoutSeconds = 30,
}: {
  stakeAccount?: web3.PublicKey
  connection?: web3.Connection
  timeoutSeconds?: number
}) {
  const startTime = Date.now()
  let stakeStatus = await connection.getStakeActivation(stakeAccount)
  while (stakeStatus.state !== 'active') {
    await sleep(1000)
    stakeStatus = await connection.getStakeActivation(stakeAccount)
    if (Date.now() - startTime > timeoutSeconds * 1000) {
      throw new Error(
        `Stake account ${stakeAccount.toBase58()} activation timeout after ${timeoutSeconds} seconds`
      )
    }
  }
}

async function addValidatorInstructionBuilder({
  marinade,
  validatorScore,
  validatorVote,
  rentPayer,
}: {
  marinade: Marinade
  validatorScore: number
  validatorVote: web3.PublicKey
  rentPayer: web3.PublicKey
}): Promise<web3.TransactionInstruction> {
  const marinadeState = await marinade.getMarinadeState()
  return await marinade.marinadeFinanceProgram.program.methods
    .addValidator(validatorScore)
    .accountsStrict({
      state: marinadeState.marinadeStateAddress,
      validatorList: marinadeState.state.validatorSystem.validatorList.account,
      rentPayer,
      rent: web3.SYSVAR_RENT_PUBKEY,
      validatorVote,
      managerAuthority: marinadeState.state.validatorSystem.managerAuthority,
      duplicationFlag: await marinadeState.validatorDuplicationFlag(
        validatorVote
      ),
      clock: web3.SYSVAR_CLOCK_PUBKEY,
      systemProgram: web3.SystemProgram.programId,
    })
    .instruction()
}

export async function waitForValidatorBeInMarinade({
  marinade,
  provider = PROVIDER,
  stakeAccount = STAKE_ACCOUNT.publicKey,
  timeoutSeconds = 30,
  voteAccount,
}: {
  marinade: Marinade
  provider?: AnchorProvider
  stakeAccount?: web3.PublicKey
  timeoutSeconds?: number
  voteAccount?: web3.PublicKey
}) {
  if (!voteAccount) {
    // when vote account is not provided then expecting the solana-test-validator
    // is running on localhost and only one vote account is available
    voteAccount = await getSingleVoteAccount()
  }

  // need to sign the add validator instruction with the marinade admin key
  // here expecting the marinade admin key is configured in marinade state
  expect(
    (await marinade.getMarinadeState()).state.validatorSystem.managerAuthority
  ).toEqual(MARINADE_STATE_ADMIN.publicKey)

  const stakeAccountData = await getParsedStakeAccountInfo(
    provider,
    stakeAccount
  )
  const stakeAccountActivationEpoch = stakeAccountData.activationEpoch
  if (stakeAccountActivationEpoch === null) {
    throw new Error(
      'Expected stake account to be already activated. Test setup error.'
    )
  }

  // for a validator could be added into Marinade, it must be activated for at least 2 epochs
  const startTime = Date.now()
  while (
    (await provider.connection.getEpochInfo()).epoch <
    stakeAccountActivationEpoch.toNumber() + 2
  ) {
    if (Date.now() - startTime > timeoutSeconds * 1000) {
      throw new Error(
        `Stake account ${stakeAccount.toBase58()} activation timeout after ${timeoutSeconds} seconds`
      )
    }
    await sleep(1000)
    console.log('Waiting for epoch activation') // TODO: remove this console.log
  }

  const addIx = await addValidatorInstructionBuilder({
    marinade,
    validatorScore: 1000,
    rentPayer: provider.wallet.publicKey,
    validatorVote: voteAccount,
  })
  const addTx = new web3.Transaction().add(addIx)
  await provider.sendAndConfirm(addTx, [MARINADE_STATE_ADMIN])
}

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}
