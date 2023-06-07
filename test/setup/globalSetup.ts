import { web3 } from '@coral-xyz/anchor'
import * as TestWorld from '../test-world'

require('ts-node/register')

export const STAKE_ACCOUNT: web3.Keypair = web3.Keypair.generate()

export default async (): Promise<void> => {
  // --- GETTING VOTE ACCOUNT of solana-test-validator ---
  const voteAccount = await TestWorld.getSingleVoteAccount()

  // --- CREATING STAKE ACCOUNT and DELEGATE ---
  // create a stake account that will be used later in all tests
  // console.log(`Configuring stake account ${STAKE_ACCOUNT.publicKey.toBase58()}`)
  const tx = new web3.Transaction()
  const ixStakeAccount = web3.StakeProgram.createAccount({
    authorized: {
      staker: TestWorld.PROVIDER.wallet.publicKey,
      withdrawer: TestWorld.PROVIDER.wallet.publicKey,
    },
    fromPubkey: TestWorld.PROVIDER.wallet.publicKey,
    lamports: 2 * web3.LAMPORTS_PER_SOL,
    stakePubkey: STAKE_ACCOUNT.publicKey,
  })
  tx.add(ixStakeAccount)
  /// delegating stake account to the vote account
  const ixDelegate = web3.StakeProgram.delegate({
    authorizedPubkey: TestWorld.PROVIDER.wallet.publicKey,
    stakePubkey: STAKE_ACCOUNT.publicKey,
    votePubkey: voteAccount,
  })
  tx.add(ixDelegate)
  await TestWorld.PROVIDER.sendAndConfirm(tx, [STAKE_ACCOUNT])

  const stakeBalance = await TestWorld.CONNECTION.getBalance(
    STAKE_ACCOUNT.publicKey
  )
  await TestWorld.CONNECTION.getAccountInfo(STAKE_ACCOUNT.publicKey)
  expect(stakeBalance).toBeGreaterThan(0)

  // --- WAITING FOR STAKE ACCOUNT to be READY ---
  // NOTE: the Anchor.toml configures slots_per_epoch to 32,
  //       the timeout of 30 seconds should be enough for the stake account to be activated
  const timeoutSeconds = 30
  const startTime = Date.now()
  let stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
    STAKE_ACCOUNT.publicKey
  )
  while (stakeStatus.state !== 'active') {
    await TestWorld.sleep(1000)
    stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
      STAKE_ACCOUNT.publicKey
    )
    if (Date.now() - startTime > timeoutSeconds * 1000) {
      throw new Error(
        `Jest global setup error: stake account ${STAKE_ACCOUNT.publicKey.toBase58()} activation timeout after ${timeoutSeconds} seconds`
      )
    }
  }
}
