package game

import (
	"context"
	"log"
	"time"
)

type Engine struct {
	sharks map[string]*SharkState
	foods  map[string]*FoodState

	joinCh  chan string
	leaveCh chan string
	inputCh chan PlayerInput

	snapshotCh chan StateSnapshot
	deathCh    chan DeathEvent
}

func New() *Engine {
	e := &Engine{
		sharks:     make(map[string]*SharkState),
		foods:      make(map[string]*FoodState),
		joinCh:     make(chan string, 16),
		leaveCh:    make(chan string, 16),
		inputCh:    make(chan PlayerInput, 256),
		snapshotCh: make(chan StateSnapshot, 4),
		deathCh:    make(chan DeathEvent, 16),
	}
	for i := 0; i < FoodCount; i++ {
		e.spawnFood()
	}
	for i := 0; i < BotCount; i++ {
		e.spawnBot()
	}
	return e
}

func (e *Engine) Join(id string)         { e.joinCh <- id }
func (e *Engine) Leave(id string)        { e.leaveCh <- id }
func (e *Engine) Input(in PlayerInput)   { e.inputCh <- in }
func (e *Engine) Snapshots() <-chan StateSnapshot { return e.snapshotCh }
func (e *Engine) Deaths() <-chan DeathEvent       { return e.deathCh }

func (e *Engine) Run(ctx context.Context) {
	ticker := time.NewTicker(TickDelta)
	defer ticker.Stop()

	tickCount := 0

	for {
		select {
		case <-ctx.Done():
			return
		case id := <-e.joinCh:
			e.addPlayer(id)
		case id := <-e.leaveCh:
			e.removePlayer(id)
		case in := <-e.inputCh:
			e.applyInput(in)
		case <-ticker.C:
			e.tick()
			tickCount++
			if tickCount%20 == 0 {
				log.Printf("--- [System] Tick running... Active sharks: %d ---", len(e.sharks))
			}
		}
	}
}

func (e *Engine) addPlayer(id string) {
	e.sharks[id] = &SharkState{
		ID:     id,
		X:      MapWidth / 2,
		Y:      MapHeight / 2,
		Radius: InitialRadius,
		CP:     MaxCP,
	}
	log.Printf("[Connect] New player joined! ID: %s", id)
}

func (e *Engine) removePlayer(id string) {
	delete(e.sharks, id)
	log.Printf("[Disconnect] Player left. ID: %s", id)
}

func (e *Engine) applyInput(in PlayerInput) {
	if shark, ok := e.sharks[in.PlayerID]; ok {
		shark.Angle = in.Angle
		shark.IsDashing = in.IsDashing
	}
}

func (e *Engine) tick() {
	for _, shark := range e.sharks {
		if shark.IsBot {
			updateBotAI(shark)
		}
		e.moveShark(shark)
		e.consumeFoodFor(shark)
	}

	dead := e.resolveCollisions()
	for id := range dead {
		shark := e.sharks[id]
		if !shark.IsBot {
			select {
			case e.deathCh <- DeathEvent{PlayerID: id, FinalScore: shark.Score}:
			default:
				log.Printf("[Warn] death channel full, dropping event for %s", id)
			}
		} else {
			e.spawnBot()
		}
		delete(e.sharks, id)
	}

	e.emitSnapshot()
}

func (e *Engine) emitSnapshot() {
	snap := StateSnapshot{
		Sharks: make([]SharkState, 0, len(e.sharks)),
		Foods:  make([]FoodState, 0, len(e.foods)),
	}
	for _, s := range e.sharks {
		snap.Sharks = append(snap.Sharks, *s)
	}
	for _, f := range e.foods {
		snap.Foods = append(snap.Foods, *f)
	}
	select {
	case e.snapshotCh <- snap:
	default:
	}
}
