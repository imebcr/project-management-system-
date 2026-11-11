"""
TSK-06 : calcul de l'avancement côté serveur (mêmes règles que l'écran) :
- feuille = valeur saisie (100 si DONE) ;
- tâche avec sous-tâches = moyenne des sous-tâches (même poids pour chacune) ;
- projet / jalon / sprint = moyenne des tâches racines ; les tâches CANCELLED sont exclues.
"""
from collections import defaultdict


def _weight(t):
    return 1


class ProgressIndex:
    def __init__(self, tasks):
        self.tasks = list(tasks)
        self.children = defaultdict(list)
        for t in self.tasks:
            if t.parent_id:
                self.children[t.parent_id].append(t)

    def task(self, t) -> int:
        kids = [k for k in self.children.get(t.id, []) if k.status != 'CANCELLED']
        if not kids:
            return 100 if t.status == 'DONE' else t.progress
        total = sum(_weight(k) for k in kids)
        return round(sum(_weight(k) * self.task(k) for k in kids) / total)

    def aggregate(self, roots) -> int:
        active = [t for t in roots if t.status != 'CANCELLED']
        total = sum(_weight(t) for t in active)
        return round(sum(_weight(t) * self.task(t) for t in active) / total) if total else 0

    def project(self, project_id) -> int:
        return self.aggregate([t for t in self.tasks if t.project_id == project_id and not t.parent_id])

    def sprint(self, sprint_id) -> int:
        return self.aggregate([t for t in self.tasks if t.sprint_id == sprint_id])


def project_progress(project) -> int:
    return ProgressIndex(project.tasks.all()).project(project.id)
