import { Marinade, MarinadeConfig, MarinadeUtils, Wallet, web3 } from '../src'
import * as TestWorld from './test-world'
import assert from 'assert'
import { AnchorProvider } from '@coral-xyz/anchor'
import {
  DirectedStakeSdk,
  findVoteRecords,
} from '@marinade.finance/directed-stake-sdk'
import { getParsedStakeAccountInfo } from '../src/util'

const addValidatorInstructionBuilder = async ({
  marinade,
  validatorScore,
  validatorVote,
  rentPayer,
}: {
  marinade: Marinade
  validatorScore: number
  validatorVote: web3.PublicKey
  rentPayer: web3.PublicKey
}): Promise<web3.TransactionInstruction> => {
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

describe('Marinade Finance', () => {
  beforeAll(async () => {
    const config = new MarinadeConfig({
      connection: TestWorld.CONNECTION,
      publicKey: TestWorld.SDK_USER.publicKey,
    })
    const marinade = new Marinade(config)
    const { transaction: liqTx } = await marinade.addLiquidity(
      MarinadeUtils.solToLamports(100)
    )
    await TestWorld.PROVIDER.sendAndConfirm(liqTx)
  })

  describe('deposit', () => {
    it('deposits SOL', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const { transaction } = await marinade.deposit(
        MarinadeUtils.solToLamports(1)
      )
      const transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
        transaction
      )
      console.log(
        'Deposit tx:',
        transactionSignature,
        transaction.instructions.length
      )
    })

    it('deposits SOL, only creates ATA when necessary', async () => {
      const newAccount = new web3.Keypair()
      await TestWorld.transferMinimumLamportsBalance(newAccount.publicKey)

      const provider = new AnchorProvider(
        TestWorld.CONNECTION,
        new Wallet(newAccount),
        { commitment: 'confirmed' }
      )

      const anotherAccount = web3.Keypair.generate()
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: newAccount.publicKey,
      })
      const marinade = new Marinade(config)

      const { transaction: tx1 } = await marinade.deposit(
        MarinadeUtils.solToLamports(1),
        { mintToOwnerAddress: anotherAccount.publicKey }
      )
      assert.strictEqual(tx1.instructions.length, 2)
      const transactionSignature1 = await provider.sendAndConfirm(tx1)
      console.log('Deposit tx1:', transactionSignature1)

      const { transaction: tx2 } = await marinade.deposit(
        MarinadeUtils.solToLamports(1),
        { mintToOwnerAddress: anotherAccount.publicKey }
      )
      assert.strictEqual(tx2.instructions.length, 1)
      const transactionSignature2 = await provider.sendAndConfirm(tx2)
      console.log('Deposit tx2:', transactionSignature2)
    })

    it('deposits SOL and get mSOL to another account', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const anotherAccount = web3.Keypair.generate()
      const { transaction } = await marinade.deposit(
        MarinadeUtils.solToLamports(1),
        { mintToOwnerAddress: anotherAccount.publicKey }
      )
      const transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
        transaction
      )
      console.log('Deposit tx:', transactionSignature)
    })

    it('deposit SOL and direct the stake', async () => {
      const validatorVoteAddress = new web3.PublicKey(
        '5MMCR4NbTZqjthjLGywmeT66iwE9J9f7kjtxzJjwfUx2'
      )
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const directedStakeSdk = new DirectedStakeSdk({
        connection: TestWorld.CONNECTION,
        wallet: {
          signTransaction: async () =>
            new Promise(() => new web3.Transaction()),
          signAllTransactions: async () =>
            new Promise(() => [new web3.Transaction()]),
          publicKey: TestWorld.SDK_USER.publicKey,
        },
      })

      const { transaction } = await marinade.deposit(
        MarinadeUtils.solToLamports(0.01),
        { directToValidatorVoteAddress: validatorVoteAddress }
      )
      let transactionSignature
      try {
        transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
          transaction,
          [],
          { commitment: 'confirmed' }
        )
      } catch (e) {
        console.log(e)
        throw e
      }
      console.log(
        'Deposit tx:',
        transactionSignature,
        transaction.instructions.length
      )

      const voteRecord = (
        await findVoteRecords({
          sdk: directedStakeSdk,
          owner: TestWorld.SDK_USER.publicKey,
        })
      )[0]

      expect(voteRecord.account.validatorVote).toEqual(validatorVoteAddress)
    })

    it('deposit SOL and redirect the stake', async () => {
      const validatorVoteAddress2 = new web3.PublicKey(
        '5ZWgXcyqrrNpQHCme5SdC5hCeYb2o3fEJhF7Gok3bTVN'
      )
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const directedStakeSdk = new DirectedStakeSdk({
        connection: TestWorld.CONNECTION,
        wallet: {
          signTransaction: async () =>
            new Promise(() => new web3.Transaction()),
          signAllTransactions: async () =>
            new Promise(() => [new web3.Transaction()]),
          publicKey: TestWorld.SDK_USER.publicKey,
        },
      })

      const { transaction } = await marinade.deposit(
        MarinadeUtils.solToLamports(0.01),
        { directToValidatorVoteAddress: validatorVoteAddress2 }
      )
      const transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
        transaction,
        [],
        { commitment: 'confirmed' }
      )
      console.log(
        'Deposit tx:',
        transactionSignature,
        transaction.instructions.length
      )

      const voteRecord = (
        await findVoteRecords({
          sdk: directedStakeSdk,
          owner: TestWorld.SDK_USER.publicKey,
        })
      )[0]

      expect(voteRecord?.account.validatorVote).toEqual(validatorVoteAddress2)
    })

    it('deposit SOL and undirect the stake', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const directedStakeSdk = new DirectedStakeSdk({
        connection: TestWorld.CONNECTION,
        wallet: {
          signTransaction: async () =>
            new Promise(() => new web3.Transaction()),
          signAllTransactions: async () =>
            new Promise(() => [new web3.Transaction()]),
          publicKey: TestWorld.SDK_USER.publicKey,
        },
      })

      const { transaction } = await marinade.deposit(
        MarinadeUtils.solToLamports(0.01)
      )
      const transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
        transaction,
        [],
        { commitment: 'confirmed' }
      )
      console.log(
        'Deposit tx:',
        transactionSignature,
        transaction.instructions.length
      )

      const voteRecord = (
        await findVoteRecords({
          sdk: directedStakeSdk,
          owner: TestWorld.SDK_USER.publicKey,
        })
      )[0]

      expect(voteRecord).toBeUndefined()
    })
  })

  // expected the `deposit SOL` test to be called before
  describe('liquidUnstake', () => {
    it('unstakes SOL', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const { transaction } = await marinade.liquidUnstake(
        MarinadeUtils.solToLamports(0.8)
      )
      const transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
        transaction
      )
      console.log('Liquid unstake tx:', transactionSignature)
    })
  })

  let stakeAccount: web3.Keypair
  describe('depositStakeAccount', () => {
    it('deposits stake account (simulate)', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      // await airdrop(TestWorld.PROVIDER.wallet.publicKey, 2 * web3.LAMPORTS_PER_SOL)
      let tx = new web3.Transaction()
      stakeAccount = web3.Keypair.generate()
      let ix = web3.StakeProgram.createAccount({
        authorized: {
          staker: TestWorld.PROVIDER.wallet.publicKey,
          withdrawer: TestWorld.PROVIDER.wallet.publicKey,
        },
        fromPubkey: TestWorld.PROVIDER.wallet.publicKey,
        lamports: 2 * web3.LAMPORTS_PER_SOL,
        stakePubkey: stakeAccount.publicKey,
      })
      tx.add(ix)
      await TestWorld.PROVIDER.sendAndConfirm(tx, [stakeAccount])
      const stakeBalance = await TestWorld.CONNECTION.getBalance(
        stakeAccount.publicKey
      )
      await TestWorld.CONNECTION.getAccountInfo(stakeAccount.publicKey)
      console.log(
        `Stake account balance: ${stakeBalance / web3.LAMPORTS_PER_SOL} SOL`
      )
      expect(stakeBalance).toBeGreaterThan(0)
      let stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
        stakeAccount.publicKey
      )
      console.log(`Stake account status: ${stakeStatus.state}`)

      // TODO: creating vote accounts and waiting for activation could be made in global jest setup
      //       https://jestjs.io/docs/configuration#globalsetup-string
      const voteAccounts = await TestWorld.getVoteAccounts()
      const voteAccount = new web3.PublicKey(voteAccounts.current[0].votePubkey)

      tx = new web3.Transaction()
      ix = web3.StakeProgram.delegate({
        authorizedPubkey: TestWorld.PROVIDER.wallet.publicKey,
        stakePubkey: stakeAccount.publicKey,
        votePubkey: voteAccount,
      })
      tx.add(ix)
      await TestWorld.PROVIDER.sendAndConfirm(tx, [])
      const timeoutSeconds = 30 // TODO: 30 seconds to fit is considered to slotsPerEpoch to minimal 32
      const startTime = Date.now()
      stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
        stakeAccount.publicKey
      )
      while (stakeStatus.state !== 'active') {
        await TestWorld.sleep(500)
        stakeStatus = await TestWorld.CONNECTION.getStakeActivation(
          stakeAccount.publicKey
        )
        console.log('status', stakeStatus)
        if (Date.now() - startTime > timeoutSeconds * 1000) {
          throw new Error(
            `Stake account activation timeout after ${timeoutSeconds} seconds`
          )
        }
      }

      expect(
        (
          await marinade.getMarinadeState()
        ).state.validatorSystem.managerAuthority.toBase58()
      ).toEqual(TestWorld.MARINADE_STATE_ADMIN.publicKey.toBase58())
      const stakeAccountData = await getParsedStakeAccountInfo(
        TestWorld.PROVIDER,
        stakeAccount.publicKey
      )
      const stakeAccountActivationEpoch = stakeAccountData.activationEpoch
      assert(stakeAccountActivationEpoch !== null)
      while (
        (await TestWorld.CONNECTION.getEpochInfo()).epoch <
        stakeAccountActivationEpoch.toNumber() + 2
      ) {
        await TestWorld.sleep(1000)
        console.log('Waiting for epoch activation')
      }
      await marinade.getMarinadeState()
      const addIx = await addValidatorInstructionBuilder({
        marinade,
        validatorScore: 1000,
        rentPayer: TestWorld.PROVIDER.wallet.publicKey,
        validatorVote: voteAccount,
      })
      const addTx = new web3.Transaction().add(addIx)
      await TestWorld.PROVIDER.sendAndConfirm(addTx, [
        TestWorld.MARINADE_STATE_ADMIN,
      ])

      // Make sure stake account still exist, if this test is included
      const { transaction } = await marinade.depositStakeAccount(
        stakeAccount.publicKey
      )

      const { executedSlot, simulatedSlot, err, logs, unitsConsumed } =
        await TestWorld.simulateTransaction(transaction)

      expect(err).toBeNull() // no error at simulation
      expect(simulatedSlot).toBeGreaterThanOrEqual(executedSlot)
      expect(unitsConsumed).toBeGreaterThan(0) // something has been processed
      console.debug('Deposit stake account tx logs:', logs)
    })
  })

  // this tests is dependent on being called after `deposits stake account (simulate)`
  describe('liquidateStakeAccount', () => {
    it('liquidates stake account (simulate)', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      // Make sure stake account still exist, if this test is included
      const { transaction } = await marinade.liquidateStakeAccount(
        stakeAccount.publicKey
      )
      const { executedSlot, simulatedSlot, err, logs, unitsConsumed } =
        await TestWorld.simulateTransaction(transaction)

      console.log(logs)
      expect(err).toBeNull() // no error at simulation
      expect(simulatedSlot).toBeGreaterThanOrEqual(executedSlot)
      expect(unitsConsumed).toBeGreaterThan(0) // something has been processed
      console.log('Liquidate stake account tx logs:', logs)
    })
  })

  // expecting this test to be called after the `deposit SOL` is executed
  describe('order unstake and claim', () => {
    let ticketAccount: web3.PublicKey | undefined

    it('order unstake', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const { transaction, ticketAccountKeypair } = await marinade.orderUnstake(
        MarinadeUtils.solToLamports(0.1)
      )
      ticketAccount = ticketAccountKeypair.publicKey
      const transactionSignature = await TestWorld.PROVIDER.sendAndConfirm(
        transaction,
        [ticketAccountKeypair]
      )
      console.log('Order unstake tx:', transactionSignature)

      const tickets = await marinade.getDelayedUnstakeTickets(
        TestWorld.SDK_USER.publicKey
      )
      const ticketKeys: web3.PublicKey[] = []
      for (const [key] of tickets) {
        ticketKeys.push(key)
      }
      expect(
        ticketKeys.filter(v => v.equals(ticketAccountKeypair.publicKey))
      ).toHaveLength(1)
    })

    it('try to claim tickets after expiration', async () => {
      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)
      const tickets = await marinade.getDelayedUnstakeTickets(
        TestWorld.SDK_USER.publicKey
      )
      for (const [key, value] of tickets) {
        if (value.ticketDue) {
          const { transaction } = await marinade.claim(key)
          await TestWorld.PROVIDER.sendAndConfirm(transaction)
        }
      }
    })

    it('claim', async () => {
      assert(ticketAccount !== undefined)

      const config = new MarinadeConfig({
        connection: TestWorld.CONNECTION,
        publicKey: TestWorld.SDK_USER.publicKey,
      })
      const marinade = new Marinade(config)

      const { transaction } = await marinade.claim(ticketAccount)
      try {
        // expecting error as the ticket is not expired yet
        await TestWorld.PROVIDER.sendAndConfirm(transaction)
        fail('should not be able to claim')
      } catch (e) {
        if (!(e as Error).message.includes('custom program error: 0x1103')) {
          console.log('Claim ticket failed with unexpected error', e)
          throw e
        }
      }
    })
  })
})
