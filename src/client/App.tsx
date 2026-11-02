import { ToastProvider } from './components/ui';
import { navigate, useRoute } from './lib/router';
import { Help, Landing } from './pages/Landing';
import { PublicBoard } from './pages/PublicBoard';
import { StudentJoin } from './pages/StudentJoin';
import { StudentPlay } from './pages/StudentPlay';
import { TeacherConsole } from './pages/TeacherConsole';
import { TeacherStart } from './pages/TeacherStart';

export function App() {
  const route = useRoute();
  let page: React.ReactNode;
  switch (route.name) {
    case 'landing':
      page = <Landing />;
      break;
    case 'help':
      page = <Help />;
      break;
    case 'teacher-start':
      page = <TeacherStart />;
      break;
    case 'teacher-console':
      page = <TeacherConsole key={route.code} code={route.code} />;
      break;
    case 'join':
      page = <StudentJoin key={route.code ?? ''} initialCode={route.code} />;
      break;
    case 'play':
      page = <StudentPlay key={route.code} code={route.code} />;
      break;
    case 'board':
      page = <PublicBoard key={route.code} code={route.code} token={route.token} />;
      break;
    default:
      page = (
        <main className="container narrow stack" style={{ padding: 48 }}>
          <h1 className="h1">없는 페이지예요</h1>
          <button className="btn" onClick={() => navigate('/')}>
            처음으로
          </button>
        </main>
      );
  }
  return <ToastProvider>{page}</ToastProvider>;
}
