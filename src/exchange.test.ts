import gql from 'graphql-tag';
import { createClient, ExchangeIO, Operation, OperationResult } from 'urql';
import { pipe, map, makeSubject, tap, publish, delay } from 'wonka';
import { cacheExchange } from './exchange';

const queryOne = gql`
  {
    author {
      id
      name
    }
  }
`;

const queryOneData = {
  __typename: 'Query',
  author: {
    __typename: 'Author',
    id: '123',
    name: 'Author',
  },
};

it('writes queries to the cache', () => {
  const client = createClient({ url: '' });
  const op = client.createRequestOperation('query', {
    key: 1,
    query: queryOne,
  });

  const response = jest.fn(
    (forwardOp: Operation): OperationResult => {
      expect(forwardOp.key).toBe(op.key);
      return { operation: forwardOp, data: queryOneData };
    }
  );

  const [ops$, next] = makeSubject<Operation>();
  const result = jest.fn();
  const forward: ExchangeIO = ops$ =>
    pipe(
      ops$,
      map(response)
    );

  pipe(
    cacheExchange({})({ forward, client })(ops$),
    tap(result),
    publish
  );

  next(op);
  next(op);
  expect(response).toHaveBeenCalledTimes(1);
  expect(result).toHaveBeenCalledTimes(2);

  expect(result.mock.calls[0][0]).toHaveProperty(
    'operation.context.meta.cacheOutcome',
    'miss'
  );
  expect(result.mock.calls[1][0]).toHaveProperty(
    'operation.context.meta.cacheOutcome',
    'hit'
  );
});

it('updates related queries when their data changes', () => {
  const queryMultiple = gql`
    {
      authors {
        id
        name
      }
    }
  `;

  const queryMultipleData = {
    __typename: 'Query',
    authors: [
      {
        __typename: 'Author',
        id: '123',
        name: 'Author',
      },
    ],
  };

  const client = createClient({ url: '' });
  const [ops$, next] = makeSubject<Operation>();

  const reexec = jest
    .spyOn(client, 'reexecuteOperation')
    .mockImplementation(next);

  const opOne = client.createRequestOperation('query', {
    key: 1,
    query: queryOne,
  });

  const opMultiple = client.createRequestOperation('query', {
    key: 2,
    query: queryMultiple,
  });

  const response = jest.fn(
    (forwardOp: Operation): OperationResult => {
      if (forwardOp.key === 1) {
        return { operation: opOne, data: queryOneData };
      } else if (forwardOp.key === 2) {
        return { operation: opMultiple, data: queryMultipleData };
      }

      return undefined as any;
    }
  );

  const forward: ExchangeIO = ops$ =>
    pipe(
      ops$,
      map(response)
    );
  const result = jest.fn();

  pipe(
    cacheExchange({})({ forward, client })(ops$),
    tap(result),
    publish
  );

  next(opOne);
  expect(response).toHaveBeenCalledTimes(1);
  expect(result).toHaveBeenCalledTimes(1);

  next(opMultiple);
  expect(response).toHaveBeenCalledTimes(2);
  expect(reexec).toHaveBeenCalledWith(opOne);
  expect(result).toHaveBeenCalledTimes(3);
});

it('does nothing when no related queries have changed', () => {
  const queryUnrelated = gql`
    {
      user {
        id
        name
      }
    }
  `;

  const queryUnrelatedData = {
    __typename: 'Query',
    user: {
      __typename: 'User',
      id: 'me',
      name: 'Me',
    },
  };

  const client = createClient({ url: '' });
  const [ops$, next] = makeSubject<Operation>();
  const reexec = jest
    .spyOn(client, 'reexecuteOperation')
    .mockImplementation(next);

  const opOne = client.createRequestOperation('query', {
    key: 1,
    query: queryOne,
  });
  const opUnrelated = client.createRequestOperation('query', {
    key: 2,
    query: queryUnrelated,
  });

  const response = jest.fn(
    (forwardOp: Operation): OperationResult => {
      if (forwardOp.key === 1) {
        return { operation: opOne, data: queryOneData };
      } else if (forwardOp.key === 2) {
        return { operation: opUnrelated, data: queryUnrelatedData };
      }

      return undefined as any;
    }
  );

  const forward: ExchangeIO = ops$ =>
    pipe(
      ops$,
      map(response)
    );
  const result = jest.fn();

  pipe(
    cacheExchange({})({ forward, client })(ops$),
    tap(result),
    publish
  );

  next(opOne);
  expect(response).toHaveBeenCalledTimes(1);

  next(opUnrelated);
  expect(response).toHaveBeenCalledTimes(2);

  expect(reexec).not.toHaveBeenCalled();
  expect(result).toHaveBeenCalledTimes(2);
});

it('writes optimistic mutations to the cache', () => {
  jest.useFakeTimers();

  const mutation = gql`
    mutation {
      concealAuthor {
        id
        name
      }
    }
  `;

  const optimisticMutationData = {
    __typename: 'Mutation',
    concealAuthor: {
      __typename: 'Author',
      id: '123',
      name: '[REDACTED OFFLINE]',
    },
  };

  const mutationData = {
    __typename: 'Mutation',
    concealAuthor: {
      __typename: 'Author',
      id: '123',
      name: '[REDACTED ONLINE]',
    },
  };

  const client = createClient({ url: '' });
  const [ops$, next] = makeSubject<Operation>();

  const reexec = jest
    .spyOn(client, 'reexecuteOperation')
    .mockImplementation(next);

  const opOne = client.createRequestOperation('query', {
    key: 1,
    query: queryOne,
  });

  const opMutation = client.createRequestOperation('mutation', {
    key: 2,
    query: mutation,
  });

  const response = jest.fn(
    (forwardOp: Operation): OperationResult => {
      if (forwardOp.key === 1) {
        return { operation: opOne, data: queryOneData };
      } else if (forwardOp.key === 2) {
        return { operation: opMutation, data: mutationData };
      }

      return undefined as any;
    }
  );

  const result = jest.fn();
  const forward: ExchangeIO = ops$ =>
    pipe(
      ops$,
      delay(1),
      map(response)
    );

  const optimistic = {
    concealAuthor: jest.fn(() => optimisticMutationData.concealAuthor) as any,
  };

  pipe(
    cacheExchange({ optimistic })({ forward, client })(ops$),
    tap(result),
    publish
  );

  next(opOne);
  jest.runAllTimers();
  expect(response).toHaveBeenCalledTimes(1);

  next(opMutation);
  expect(response).toHaveBeenCalledTimes(1);
  expect(optimistic.concealAuthor).toHaveBeenCalledTimes(1);
  expect(reexec).toHaveBeenCalledTimes(1);

  jest.runAllTimers();
  expect(response).toHaveBeenCalledTimes(2);
  expect(result).toHaveBeenCalledTimes(4);
});