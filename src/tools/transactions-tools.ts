/**
 * Wave Transaction Tools
 *
 * Wave's public GraphQL API (https://gql.waveapps.com/graphql/public) has no way to
 * read or list transactions: `Business`, `Account`, and the root `Query` type all lack
 * any transaction field, and the `Transaction` type itself only exposes `id`. The only
 * transaction operations that exist are the `moneyTransactionCreate`/`moneyTransactionsCreate`
 * mutations. Confirmed against Wave's own docs (developer.waveapps.com) and a full schema
 * introspection dated 2026-06-14.
 *
 * wave_list_transactions, wave_get_transaction, wave_update_transaction,
 * wave_categorize_transaction, and wave_list_transaction_attachments were querying fields
 * that don't exist and have been removed (kept commented out below in case Wave adds
 * read support later). wave_create_transaction below has been fixed to call the real
 * moneyTransactionCreate mutation with its actual input shape (an anchor account +
 * balancing line items), instead of the nonexistent transactionCreate mutation it
 * originally called.
 */

import type { WaveClient } from '../client.js';

export function registerTransactionTools(client: WaveClient) {
  return {
    wave_create_transaction: {
      description: 'Create a money transaction: a withdrawal from or deposit to an anchor account (e.g. a bank or credit card account), categorized against one line item account (e.g. a sales or expense account)',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          description: { type: 'string', description: 'Transaction description' },
          date: { type: 'string', description: 'Transaction date (YYYY-MM-DD)' },
          amount: { type: 'string', description: 'Transaction amount (positive Decimal string, e.g. "100.00")' },
          anchorAccountId: { type: 'string', description: 'The Anchor Account (bank, credit card, or other real-world account) the money moves into or out of' },
          direction: { type: 'string', enum: ['DEPOSIT', 'WITHDRAWAL'], description: 'DEPOSIT if the business received money into the anchor account, WITHDRAWAL if it spent money from it' },
          categorizeAccountId: { type: 'string', description: 'The Categorization Account (e.g. sales, expenses) this transaction is recorded against' },
          balance: { type: 'string', enum: ['INCREASE', 'DECREASE'], description: 'Whether this transaction increases or decreases the categorization account\'s balance' },
          notes: { type: 'string', description: 'Optional notes' },
          externalId: { type: 'string', description: 'Optional external reference ID; a random one is generated if omitted' },
        },
        required: ['description', 'date', 'amount', 'anchorAccountId', 'direction', 'categorizeAccountId', 'balance'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const mutation = `
          mutation CreateMoneyTransaction($input: MoneyTransactionCreateInput!) {
            moneyTransactionCreate(input: $input) {
              transaction {
                id
              }
              didSucceed
              inputErrors {
                message
                path
                code
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: {
            businessId,
            externalId: args.externalId || `wave-mcp-${Date.now()}`,
            date: args.date,
            description: args.description,
            notes: args.notes,
            anchor: {
              accountId: args.anchorAccountId,
              amount: args.amount,
              direction: args.direction,
            },
            lineItems: [
              {
                accountId: args.categorizeAccountId,
                amount: args.amount,
                balance: args.balance,
              },
            ],
          },
        });

        if (!result.moneyTransactionCreate.didSucceed) {
          throw new Error(`Failed to create transaction: ${JSON.stringify(result.moneyTransactionCreate.inputErrors)}`);
        }

        return result.moneyTransactionCreate.transaction;
      },
    },

    /* ---------------------------------------------------------------------
     * The tools below query fields that don't exist in Wave's public API
     * (see file header). Left here, inert, as a starting point in case Wave
     * adds transaction read support in the future.
     * ---------------------------------------------------------------------

    wave_list_transactions: {
      description: 'List transactions for a business with filtering options',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          accountId: { type: 'string', description: 'Filter by specific account ID' },
          startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
          page: { type: 'number', description: 'Page number (default: 1)' },
          pageSize: { type: 'number', description: 'Results per page (default: 50)' },
        },
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const query = `
          query GetTransactions($businessId: ID!, $page: Int!, $pageSize: Int!) {
            business(id: $businessId) {
              transactions(page: $page, pageSize: $pageSize) {
                pageInfo {
                  currentPage
                  totalPages
                  totalCount
                }
                edges {
                  node {
                    id
                    description
                    amount {
                      value
                      currency { code }
                    }
                    date
                    accountTransaction {
                      account {
                        id
                        name
                        type { name }
                      }
                      amount { value }
                    }
                    createdAt
                    modifiedAt
                  }
                }
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          page: args.page || 1,
          pageSize: Math.min(args.pageSize || 50, 100),
        });

        let transactions = result.business.transactions.edges.map((e: any) => e.node);

        // Client-side filtering
        if (args.accountId) {
          transactions = transactions.filter((t: any) =>
            t.accountTransaction?.account?.id === args.accountId
          );
        }

        if (args.startDate) {
          transactions = transactions.filter((t: any) => t.date >= args.startDate);
        }

        if (args.endDate) {
          transactions = transactions.filter((t: any) => t.date <= args.endDate);
        }

        return {
          transactions,
          pageInfo: result.business.transactions.pageInfo,
        };
      },
    },

    wave_get_transaction: {
      description: 'Get detailed information about a specific transaction',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          transactionId: { type: 'string', description: 'Transaction ID' },
        },
        required: ['transactionId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const query = `
          query GetTransaction($businessId: ID!, $transactionId: ID!) {
            business(id: $businessId) {
              transaction(id: $transactionId) {
                id
                description
                amount {
                  value
                  currency { code symbol }
                }
                date
                accountTransaction {
                  account {
                    id
                    name
                    type { name }
                  }
                  amount { value }
                }
                createdAt
                modifiedAt
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          transactionId: args.transactionId,
        });

        return result.business.transaction;
      },
    },

    wave_update_transaction: {
      description: 'Update an existing transaction',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          transactionId: { type: 'string', description: 'Transaction ID' },
          description: { type: 'string', description: 'Transaction description' },
          date: { type: 'string', description: 'Transaction date (YYYY-MM-DD)' },
        },
        required: ['transactionId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const mutation = `
          mutation UpdateTransaction($input: TransactionUpdateInput!) {
            transactionUpdate(input: $input) {
              transaction {
                id
                description
                date
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: {
            businessId,
            transactionId: args.transactionId,
            description: args.description,
            date: args.date,
          },
        });

        if (!result.transactionUpdate.didSucceed) {
          throw new Error(`Failed to update transaction: ${JSON.stringify(result.transactionUpdate.inputErrors)}`);
        }

        return result.transactionUpdate.transaction;
      },
    },

    wave_categorize_transaction: {
      description: 'Categorize/recategorize a transaction to a different account',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          transactionId: { type: 'string', description: 'Transaction ID' },
          accountId: { type: 'string', description: 'New account ID for categorization' },
        },
        required: ['transactionId', 'accountId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const mutation = `
          mutation CategorizeTransaction($input: TransactionCategorizeInput!) {
            transactionCategorize(input: $input) {
              transaction {
                id
                accountTransaction {
                  account {
                    id
                    name
                    type { name }
                  }
                }
              }
              didSucceed
              inputErrors {
                message
                path
              }
            }
          }
        `;

        const result = await client.mutate(mutation, {
          input: {
            businessId,
            transactionId: args.transactionId,
            accountId: args.accountId,
          },
        });

        if (!result.transactionCategorize.didSucceed) {
          throw new Error(`Failed to categorize transaction: ${JSON.stringify(result.transactionCategorize.inputErrors)}`);
        }

        return result.transactionCategorize.transaction;
      },
    },

    wave_list_transaction_attachments: {
      description: 'List attachments (receipts, documents) for a transaction',
      parameters: {
        type: 'object',
        properties: {
          businessId: { type: 'string', description: 'Business ID' },
          transactionId: { type: 'string', description: 'Transaction ID' },
        },
        required: ['transactionId'],
      },
      handler: async (args: any) => {
        const businessId = args.businessId || client.getBusinessId();
        if (!businessId) throw new Error('businessId required');

        const query = `
          query GetTransactionAttachments($businessId: ID!, $transactionId: ID!) {
            business(id: $businessId) {
              transaction(id: $transactionId) {
                id
                attachments {
                  id
                  filename
                  url
                  mimeType
                  size
                  createdAt
                }
              }
            }
          }
        `;

        const result = await client.query(query, {
          businessId,
          transactionId: args.transactionId,
        });

        return result.business.transaction.attachments;
      },
    },

    --------------------------------------------------------------------- */
  };
}
