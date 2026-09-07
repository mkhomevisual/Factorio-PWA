import type { AppDatabase } from './db.js';
import type { FactorySnapshot } from './factory-adapter.js';

export type CompletedProductionGoal = {
  id: string;
  item: string;
  targetAmount: number;
  createdBy: string;
};

type GoalRow = {
  id: string;
  item: string;
  target_amount: number;
  progress_amount: number;
  last_counter: number;
  created_by: string;
};

export function productionCounterDelta(previous: number, current: number) {
  return current >= previous ? current - previous : 0;
}

export function advanceProductionGoals(db: AppDatabase, snapshot: FactorySnapshot, at: string): CompletedProductionGoal[] {
  const counters = new Map(snapshot.sharedFactory.map((entry) => [entry.item, Math.max(0, entry.produced)]));
  const goals = db.prepare("SELECT id,item,target_amount,progress_amount,last_counter,created_by FROM production_goals WHERE status='active'").all() as GoalRow[];
  const update = db.prepare(`UPDATE production_goals
    SET progress_amount=?,last_counter=?,status=?,updated_at=?,completed_at=? WHERE id=?`);
  const completed: CompletedProductionGoal[] = [];

  db.transaction(() => {
    for (const goal of goals) {
      const counter = counters.get(goal.item) ?? goal.last_counter;
      const progress = Math.min(goal.target_amount, goal.progress_amount + productionCounterDelta(goal.last_counter, counter));
      const isComplete = progress >= goal.target_amount;
      update.run(progress, counter, isComplete ? 'completed' : 'active', at, isComplete ? at : null, goal.id);
      if (isComplete) completed.push({ id: goal.id, item: goal.item, targetAmount: goal.target_amount, createdBy: goal.created_by });
    }
  })();
  return completed;
}
