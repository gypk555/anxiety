import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';
import { setNavigator } from '@/lib/queries';
import { Help } from '@/routes/Help';
import { Home } from '@/routes/Home';
import { RequireAccount } from '@/shell/Guards';
import { NotFound, RootError, RouteError } from '@/shell/RouteError';
import { Shell, type RouteHandle } from '@/shell/Shell';

// Help and Home ship in the first bundle, so a failed chunk can never strand someone away from Help.
const page = (load: () => Promise<{ default: ComponentType }>): LazyExoticComponent<ComponentType> => lazy(load);

const CheckInChoice = page(() => import('@/routes/CheckIn').then((m) => ({ default: m.CheckInChoice })));
const CheckInIntro = page(() => import('@/routes/CheckIn').then((m) => ({ default: m.CheckInIntro })));
const CheckInStep = page(() => import('@/routes/CheckIn').then((m) => ({ default: m.CheckInStep })));
const ReflectionStep = page(() => import('@/routes/Reflection').then((m) => ({ default: m.ReflectionStep })));
const GuestReflectionPage = page(() => import('@/routes/Reflection').then((m) => ({ default: m.GuestReflectionPage })));
const SavedReflectionPage = page(() => import('@/routes/Reflection').then((m) => ({ default: m.SavedReflectionPage })));
const GuestResultPage = page(() => import('@/routes/Result').then((m) => ({ default: m.GuestResultPage })));
const SavedResultPage = page(() => import('@/routes/Result').then((m) => ({ default: m.SavedResultPage })));
const Tools = page(() => import('@/routes/Tools'));
const Breathe = page(() => import('@/routes/Breathe'));
const Ground = page(() => import('@/routes/Ground'));
const Sounds = page(() => import('@/routes/Sounds'));
const JournalList = page(() => import('@/routes/Journal').then((m) => ({ default: m.JournalList })));
const JournalDetail = page(() => import('@/routes/Journal').then((m) => ({ default: m.JournalDetail })));
const JournalNew = page(() => import('@/routes/JournalForm').then((m) => ({ default: m.JournalNew })));
const JournalEdit = page(() => import('@/routes/JournalForm').then((m) => ({ default: m.JournalEdit })));
const Trends = page(() => import('@/routes/Trends'));
const MoodLog = page(() => import('@/routes/MoodLog'));
const Report = page(() => import('@/routes/Report'));
const SafetyPlanView = page(() => import('@/routes/SafetyPlan').then((m) => ({ default: m.SafetyPlanView })));
const SafetyPlanEdit = page(() => import('@/routes/SafetyPlan').then((m) => ({ default: m.SafetyPlanEdit })));
const Settings = page(() => import('@/routes/Settings'));
const SignIn = page(() => import('@/routes/SignIn').then((m) => ({ default: m.SignIn })));
const SignInCode = page(() => import('@/routes/SignIn').then((m) => ({ default: m.SignInCode })));
const CreateAccount = page(() => import('@/routes/CreateAccount').then((m) => ({ default: m.CreateAccount })));
const CreateAccountCode = page(() => import('@/routes/CreateAccount').then((m) => ({ default: m.CreateAccountCode })));
const ForgotPassword = page(() => import('@/routes/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = page(() => import('@/routes/ForgotPassword').then((m) => ({ default: m.ResetPassword })));
const Consent = page(() => import('@/routes/Consent'));
const Name = page(() => import('@/routes/Name'));
const AboutYou = page(() => import('@/routes/AboutYou'));
const Privacy = page(() => import('@/routes/Legal').then((m) => ({ default: m.Privacy })));
const Terms = page(() => import('@/routes/Legal').then((m) => ({ default: m.Terms })));
const About = page(() => import('@/routes/Legal').then((m) => ({ default: m.About })));

const focus: RouteHandle = { focus: true };
const reading: RouteHandle = { wide: true };

export const routes = [
  {
    element: <Shell />,
    errorElement: <RootError />,
    children: [
      {
        // Inside the shell, so a failing screen keeps the header and "Get help".
        errorElement: <RouteError />,
        element: <Outlet />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/help', element: <Help />, handle: reading },
          { path: '/check-in', element: <CheckInChoice />, handle: focus },
          { path: '/check-in/gad7', element: <CheckInIntro />, handle: focus },
          { path: '/check-in/:step', element: <CheckInStep />, handle: focus },
          { path: '/result', element: <GuestResultPage /> },
          { path: '/reflection/result', element: <GuestReflectionPage /> },
          { path: '/reflection/:step', element: <ReflectionStep />, handle: focus },
          { path: '/tools', element: <Tools /> },
          { path: '/tools/breathe', element: <Breathe />, handle: { focus: true, night: true } satisfies RouteHandle },
          { path: '/tools/ground', element: <Ground />, handle: focus },
          { path: '/tools/sounds', element: <Sounds /> },
          { path: '/settings', element: <Settings /> },
          { path: '/sign-in', element: <SignIn />, handle: focus },
          { path: '/sign-in/code', element: <SignInCode />, handle: focus },
          { path: '/create-account', element: <CreateAccount />, handle: focus },
          { path: '/create-account/code', element: <CreateAccountCode />, handle: focus },
          { path: '/forgot-password', element: <ForgotPassword />, handle: focus },
          { path: '/forgot-password/reset', element: <ResetPassword />, handle: focus },
          { path: '/consent', element: <Consent />, handle: { focus: true, wide: true } satisfies RouteHandle },
          // Asked after consent of an account with no name. Outside RequireAccount, like consent, so it can't loop.
          { path: '/name', element: <Name />, handle: focus },
          // Offered once after the name, and skippable: never a gate.
          { path: '/about-you', element: <AboutYou />, handle: focus },
          { path: '/privacy', element: <Privacy />, handle: reading },
          { path: '/terms', element: <Terms />, handle: reading },
          { path: '/about', element: <About />, handle: reading },
          // Guests can keep a plan on this device, so these are outside RequireAccount.
          { path: '/safety-plan', element: <SafetyPlanView /> },
          { path: '/safety-plan/edit', element: <SafetyPlanEdit />, handle: focus },
          {
            element: <RequireAccount />,
            children: [
              { path: '/result/:id', element: <SavedResultPage /> },
              { path: '/reflections/:id', element: <SavedReflectionPage /> },
              { path: '/trends', element: <Trends /> },
              { path: '/mood', element: <MoodLog /> },
              { path: '/report', element: <Report />, handle: reading },
              { path: '/journal', element: <JournalList /> },
              { path: '/journal/new', element: <JournalNew />, handle: focus },
              { path: '/journal/:id', element: <JournalDetail /> },
              { path: '/journal/:id/edit', element: <JournalEdit />, handle: focus },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];

export function makeRouter() {
  const router = createBrowserRouter(routes);
  setNavigator((to) => void router.navigate(to));
  return router;
}
