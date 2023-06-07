import { web3 } from '@coral-xyz/anchor'
import * as TestWorld from '../test-world'
import { Marinade, MarinadeConfig } from '../../src'

require('ts-node/register')

export default async (): Promise<void> => {
  // --- GETTING VOTE ACCOUNT of solana-test-validator ---
  const voteAccount = await TestWorld.getSingleVoteAccount()

  // --- CREATING STAKE ACCOUNT and DELEGATE ---
  // create a stake account that will be used later in all tests
  // console.log(`Configuring stake account ${TestWorld.STAKE_ACCOUNT.publicKey.toBase58()}`)
  const tx = new web3.Transaction()
  const ixStakeAccount = web3.StakeProgram.createAccount({
    authorized: {
      staker: TestWorld.PROVIDER.wallet.publicKey,
      withdrawer: TestWorld.PROVIDER.wallet.publicKey,
    },
    fromPubkey: TestWorld.PROVIDER.wallet.publicKey,
    lamports: 2 * web3.LAMPORTS_PER_SOL,
    stakePubkey: TestWorld.STAKE_ACCOUNT.publicKey,
  })
  tx.add(ixStakeAccount)
  /// delegating stake account to the vote account
  const ixDelegate = web3.StakeProgram.delegate({
    authorizedPubkey: TestWorld.PROVIDER.wallet.publicKey,
    stakePubkey: TestWorld.STAKE_ACCOUNT.publicKey,
    votePubkey: voteAccount,
  })
  tx.add(ixDelegate)
  await TestWorld.PROVIDER.sendAndConfirm(tx, [TestWorld.STAKE_ACCOUNT])

  const stakeBalance = await TestWorld.CONNECTION.getBalance(
    TestWorld.STAKE_ACCOUNT.publicKey
  )
  await TestWorld.CONNECTION.getAccountInfo(TestWorld.STAKE_ACCOUNT.publicKey)
  if (!stakeBalance) {
    throw new Error('Jest global setup error: no stake account balance')
  }

  // --- WAITING FOR STAKE ACCOUNT to be READY ---
  // NOTE: the Anchor.toml configures slots_per_epoch to 32,
  //       the timeout of 30 seconds should be enough for the stake account to be activated
  const timeoutSeconds = 30
  const startTime = Date.now()
  let stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
    TestWorld.STAKE_ACCOUNT.publicKey
  )
  console.log(
    `Waiting 2 epochs for stake account ${TestWorld.STAKE_ACCOUNT.publicKey.toBase58()} to be activated`
  )
  while (stakeStatus.state !== 'active') {
    await TestWorld.sleep(1000)
    stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
      TestWorld.STAKE_ACCOUNT.publicKey
    )
    if (Date.now() - startTime > timeoutSeconds * 1000) {
      throw new Error(
        `Jest global setup error: stake account ${TestWorld.STAKE_ACCOUNT.publicKey.toBase58()}` +
          ` activation timeout after ${timeoutSeconds} seconds`
      )
    }
  }
  console.log(
    `Stake account ${TestWorld.STAKE_ACCOUNT.publicKey.toBase58()} is activated after ${
      (Date.now() - startTime) / 1000
    } s`
  )

  // --- ADDING solana-test-validator under MARINADE ---
  const config = new MarinadeConfig({
    connection: TestWorld.CONNECTION,
    publicKey: TestWorld.SDK_USER.publicKey,
  })
  const marinade = new Marinade(config)
  const marinadeState = await marinade.getMarinadeState()
  if (
    !marinadeState.state.validatorSystem.managerAuthority.equals(
      TestWorld.MARINADE_STATE_ADMIN.publicKey
    )
  ) {
    throw new Error(
      'Jest global setup error: Marinade expected to be configured with the TestWorld state admin.'
    )
  }

  const addIx = await TestWorld.addValidatorInstructionBuilder({
    marinade,
    validatorScore: 1000,
    rentPayer: TestWorld.PROVIDER.wallet.publicKey,
    validatorVote: voteAccount,
  })
  const addTx = new web3.Transaction().add(addIx)
  await TestWorld.PROVIDER.sendAndConfirm(addTx, [
    TestWorld.MARINADE_STATE_ADMIN,
  ])
}
