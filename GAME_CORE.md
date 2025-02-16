# API Documentation

## Base URL

`http://localhost:3333`

## WebSocket Events

### Client -> Server

- `subscribeToMatch`: Subscribe to real-time updates for a specific match
  - Parameter: `matchId` (string)
- `unsubscribeFromMatch`: Unsubscribe from match updates
  - Parameter: `matchId` (string)

### Server -> Client

- `matchUpdate`: Receives real-time match updates
  - Payload:
    ```typescript
    {
      matchId: string;
      state: GameState;
      summary: {
        currentRound: "round1" | "round2" | "round3";
        currentTurn: string;
        roundWinners: {
          round1?: "team1" | "team2";
          round2?: "team1" | "team2";
          round3?: "team1" | "team2";
        };
        gameWinner?: "team1" | "team2";
        isComplete: boolean;
      }
    }
    ```

## REST Endpoints

### Create Match

- **URL**: `/api/v1/match/create`
- **Method**: `POST`
- **Body**:
  ```typescript
  {
    team1: {
      player1: string;
      player2: string;
    }
    team2: {
      player1: string;
      player2: string;
    }
  }
  ```
- **Response**:
  ```typescript
  {
    matchId: string;
    state: {
      team1: Team;
      team2: Team;
      currentTurn: string;
      currentRound: "round1" | "round2" | "round3";
      roundWinners: {
      }
    }
  }
  ```
- **Error Response**: `400` if invalid request body

### Get Match Details

- **URL**: `/api/v1/match/:matchId`
- **Method**: `GET`
- **Parameters**:
  - `matchId`: Match identifier
- **Response**:
  ```typescript
  {
    matchId: string;
    state: GameState;
    rounds: {
      round1: Play[];
      round2: Play[];
      round3: Play[];
    };
    summary: {
      currentRound: "round1" | "round2" | "round3";
      currentTurn: string;
      roundWinners: {
        round1?: "team1" | "team2";
        round2?: "team1" | "team2";
        round3?: "team1" | "team2";
      };
      gameWinner?: "team1" | "team2";
      isComplete: boolean;
    }
  }
  ```
- **Error Response**: `404` if match not found

### Get Match Plays

- **URL**: `/api/v1/match/:matchId/plays`
- **Method**: `GET`
- **Parameters**:
  - `matchId`: Match identifier
- **Response**:
  ```typescript
  {
    matchId: string;
    plays: {
      round1: Play[];
      round2: Play[];
      round3: Play[];
    }
  }
  ```
- **Error Response**: `404` if match not found

### Make a Play

- **URL**: `/api/v1/:matchId/:userId/:cardvalue/:suit`
- **Method**: `GET`
- **Parameters**:
  - `matchId`: Match identifier
  - `userId`: Player identifier
  - `cardvalue`: Card value (1-13)
  - `suit`: Card suit ("hearts", "diamonds", "clubs", "spades")
- **Response**:
  ```typescript
  {
    match: Match;
    currentRound: "round1" | "round2" | "round3";
    roundWinners: {
      round1?: "team1" | "team2";
      round2?: "team1" | "team2";
      round3?: "team1" | "team2";
    };
    winner?: "team1" | "team2";
  }
  ```
- **Error Responses**:
  - `400` if not player's turn
  - `400` if invalid card data
  - `404` if match not found

### Get Active Matches

- **URL**: `/api/v1/matches/active`
- **Method**: `GET`
- **Response**:
  ```typescript
  {
    matches: Array<{
      matchId: string;
      state: GameState;
      summary: {
        currentRound: "round1" | "round2" | "round3";
        currentTurn: string;
        roundWinners: {
          round1?: "team1" | "team2";
          round2?: "team1" | "team2";
          round3?: "team1" | "team2";
        };
      };
    }>;
  }
  ```

### Health Check

- **URL**: `/`
- **Method**: `GET`
- **Response**: Text response "Hello Hono!"

## Types

### Card

```typescript
{
  value: number; // 1-13
  suit: "hearts" | "diamonds" | "clubs" | "spades";
}
```

### Team

```typescript
{
  player1: string;
  player2: string;
}
```

### Play

```typescript
{
  id: string;
  userId: string;
  timestamp: number;
  card: Card;
}
```

### GameState

```typescript
{
  team1: Team;
  team2: Team;
  currentTurn: string;
  currentRound: "round1" | "round2" | "round3";
  roundWinners?: {
    round1?: "team1" | "team2";
    round2?: "team1" | "team2";
    round3?: "team1" | "team2";
  };
  winner?: "team1" | "team2";
  gameComplete?: boolean;
}
```
